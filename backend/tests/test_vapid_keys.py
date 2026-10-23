"""VAPID key compatibility: format, env pair consistency, and a signed + encrypted delivery round trip."""
from __future__ import annotations

import base64
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import http_ece
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from dotenv import dotenv_values

from scripts.generate_vapid_keys import generate
from services import push_delivery


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def _public_from_private(private_b64: str) -> str:
    key = ec.derive_private_key(int.from_bytes(_b64url_decode(private_b64), 'big'), ec.SECP256R1())
    return _b64url(key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint))


def test_generated_pair_has_browser_compatible_format():
    public, private = generate()
    raw_public = _b64url_decode(public)
    assert len(raw_public) == 65 and raw_public[0] == 0x04
    assert len(_b64url_decode(private)) == 32
    assert _public_from_private(private) == public


def test_configured_env_pair_is_a_matching_pair():
    values = dotenv_values(Path(__file__).resolve().parents[1] / '.env')
    public, private = values.get('VAPID_PUBLIC_KEY'), values.get('VAPID_PRIVATE_KEY')
    if not (public and private):
        pytest.skip('VAPID keys are not configured in this environment')
    assert _public_from_private(private) == public
    assert str(values.get('VAPID_SUBJECT', '')).startswith('mailto:')


def test_delivery_is_signed_with_the_key_and_decrypts_for_the_subscriber():
    public, private = generate()
    client_key = ec.generate_private_key(ec.SECP256R1())
    auth_secret = os.urandom(16)
    received = {}

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            received['headers'] = {key.lower(): value for key, value in self.headers.items()}
            received['body'] = self.rfile.read(int(self.headers['Content-Length']))
            self.send_response(201)
            self.end_headers()

        def log_message(self, *args):
            pass

    server = HTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        endpoint = f'http://127.0.0.1:{server.server_port}/push/abc'
        subscription = {
            'endpoint': endpoint,
            'keys': {
                'p256dh': _b64url(client_key.public_key().public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)),
                'auth': _b64url(auth_secret),
            },
        }
        payload = {'event_id': 'evt-1', 'title': 'Hello', 'body': 'Wallet topped up', 'url': '/my-account/wallet'}
        push_delivery._send(subscription, payload, private, 'mailto:support@prizeleague.co.uk')
    finally:
        server.shutdown()

    authorization = received['headers']['authorization']
    scheme, _, rest = authorization.partition(' ')
    assert scheme.lower() == 'vapid'
    parts = dict(item.strip().split('=', 1) for item in rest.split(','))
    assert parts['k'] == public

    server_public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), _b64url_decode(public))
    claims = jwt.decode(parts['t'], server_public, algorithms=['ES256'], audience=f'http://127.0.0.1:{server.server_port}')
    assert claims['sub'] == 'mailto:support@prizeleague.co.uk'

    decrypted = http_ece.decrypt(received['body'], private_key=client_key, auth_secret=auth_secret, version='aes128gcm')
    assert json.loads(decrypted) == payload

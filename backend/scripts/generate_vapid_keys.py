"""Generate a VAPID key pair for Web Push and write it to an env file.

Usage: python scripts/generate_vapid_keys.py --env-file /secure/path/backend.env [--force]

The private key is written only to the env file (mode 600) and is never printed.
"""
from __future__ import annotations

import argparse
import base64
import os
import stat
import sys

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid

SUBJECT = 'mailto:support@prizeleague.co.uk'


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()


def generate() -> tuple[str, str]:
    vapid = Vapid()
    vapid.generate_keys()
    private = vapid.private_key.private_numbers().private_value.to_bytes(32, 'big')
    public = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return _b64url(public), _b64url(private)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--env-file', required=True)
    parser.add_argument('--subject', default=SUBJECT)
    parser.add_argument('--force', action='store_true', help='Replace existing VAPID keys (invalidates all subscriptions)')
    args = parser.parse_args()

    lines = []
    if os.path.exists(args.env_file):
        with open(args.env_file, encoding='utf-8') as handle:
            lines = handle.read().splitlines()
    existing = {line.split('=', 1)[0] for line in lines if '=' in line and not line.lstrip().startswith('#')}
    if {'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'} & existing and not args.force:
        print('VAPID keys already exist; use --force to replace them (existing browser subscriptions will stop working).')
        return 1

    public, private = generate()
    managed = {'VAPID_PUBLIC_KEY': public, 'VAPID_PRIVATE_KEY': private, 'VAPID_SUBJECT': args.subject}
    kept = [line for line in lines if line.split('=', 1)[0] not in managed]
    kept += [f'{key}={value}' for key, value in managed.items()]

    descriptor = os.open(args.env_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, stat.S_IRUSR | stat.S_IWUSR)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
        handle.write('\n'.join(kept) + '\n')
    os.chmod(args.env_file, stat.S_IRUSR | stat.S_IWUSR)

    print(f'Wrote VAPID keys to {args.env_file}')
    print(f'VAPID_PUBLIC_KEY={public}')
    return 0


if __name__ == '__main__':
    sys.exit(main())

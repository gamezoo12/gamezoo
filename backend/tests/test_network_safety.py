from pathlib import Path
import subprocess
import sys


def test_loopback_only_network_guard_blocks_external_connections():
    probe = '''
import socket
from network_safety import install_loopback_only_network_guard

listener = socket.socket()
listener.bind(("127.0.0.1", 0))
listener.listen(1)
listener.settimeout(1)
install_loopback_only_network_guard()

client = socket.socket()
client.settimeout(1)
client.connect(listener.getsockname())
accepted, _ = listener.accept()
accepted.close()
client.close()

try:
    socket.getaddrinfo("api.stripe.com", 443)
except OSError as error:
    assert "Non-loopback network access is disabled" in str(error)
else:
    raise AssertionError("External hostname lookup was not blocked")

try:
    socket.create_connection(("203.0.113.1", 443), timeout=1)
except OSError as error:
    assert "Non-loopback network access is disabled" in str(error)
else:
    raise AssertionError("Non-loopback connection was not blocked")
'''
    result = subprocess.run(
        [sys.executable, '-c', probe],
        cwd=Path(__file__).resolve().parents[1],
        capture_output=True,
        text=True,
        timeout=5,
    )

    assert result.returncode == 0, result.stderr
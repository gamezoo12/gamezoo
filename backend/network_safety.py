import errno
import ipaddress
import socket


_guard_installed = False


def _is_allowed_address(sock, address):
    if sock.family == socket.AF_UNIX:
        return True
    if sock.family not in (socket.AF_INET, socket.AF_INET6):
        return False
    if not isinstance(address, tuple) or not address:
        return False
    try:
        return ipaddress.ip_address(address[0]).is_loopback
    except (TypeError, ValueError):
        return False


def install_loopback_only_network_guard():
    global _guard_installed
    if _guard_installed:
        return

    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex
    original_getaddrinfo = socket.getaddrinfo

    def guarded_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        if host is None and flags & socket.AI_PASSIVE:
            return original_getaddrinfo(host, port, family, type, proto, flags)
        normalized_host = host.decode('ascii') if isinstance(host, bytes) else host
        if isinstance(normalized_host, str) and normalized_host.rstrip('.').lower() == 'localhost':
            return original_getaddrinfo(host, port, family, type, proto, flags)
        try:
            if not ipaddress.ip_address(normalized_host).is_loopback:
                raise ValueError
        except (TypeError, ValueError):
            raise OSError(errno.EACCES, 'Non-loopback network access is disabled in isolated test mode')
        return original_getaddrinfo(host, port, family, type, proto, flags)

    def guarded_connect(sock, address):
        if not _is_allowed_address(sock, address):
            raise OSError(errno.EACCES, 'Non-loopback network access is disabled in isolated test mode')
        return original_connect(sock, address)

    def guarded_connect_ex(sock, address):
        if not _is_allowed_address(sock, address):
            return errno.EACCES
        return original_connect_ex(sock, address)

    socket.socket.connect = guarded_connect
    socket.socket.connect_ex = guarded_connect_ex
    socket.getaddrinfo = guarded_getaddrinfo
    _guard_installed = True
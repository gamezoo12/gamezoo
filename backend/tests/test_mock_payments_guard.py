import pytest
from routers import payments_routes


@pytest.mark.parametrize('env', [{'ENVIRONMENT': 'production'}, {'APP_ENV': 'live'}, {'STRIPE_MODE': 'live'}])
def test_mock_payments_disabled_in_production(monkeypatch, env):
    for key in ('ENVIRONMENT', 'APP_ENV', 'STRIPE_MODE'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('TEST_MODE', '1')
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    assert payments_routes._mock_payments_enabled() is False


def test_mock_payments_enabled_only_in_non_production_test_mode(monkeypatch):
    for key in ('ENVIRONMENT', 'APP_ENV'):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv('STRIPE_MODE', 'test')
    monkeypatch.delenv('TEST_MODE', raising=False)
    assert payments_routes._mock_payments_enabled() is False
    monkeypatch.setenv('TEST_MODE', '1')
    assert payments_routes._mock_payments_enabled() is True

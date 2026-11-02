"""Per-request memoisation for hot read-only lookups (active only during GET requests)."""
import copy
import functools
from contextvars import ContextVar

_request_cache: ContextVar[dict | None] = ContextVar('request_cache', default=None)


def start_request_cache():
    return _request_cache.set({})


def end_request_cache(token):
    _request_cache.reset(token)


def request_memo(fn):
    """Cache an async read-only helper's result for the rest of the current GET request.
    The first positional argument (db) is ignored in the key; results are deep-copied."""
    @functools.wraps(fn)
    async def wrapper(db, *args, **kwargs):
        cache = _request_cache.get()
        if cache is None:
            return await fn(db, *args, **kwargs)
        key = (fn.__module__, fn.__qualname__, repr(args), repr(sorted(kwargs.items())))
        if key not in cache:
            cache[key] = await fn(db, *args, **kwargs)
        return copy.deepcopy(cache[key])
    return wrapper

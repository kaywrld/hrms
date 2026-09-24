"""
cache.delete_pattern(...) is a django-redis extension — it doesn't exist on
Django's built-in cache backends (e.g. LocMemCache, used locally when Redis
isn't installed — see USE_REDIS_CACHE in settings.py). Calling it directly
against a non-Redis backend raises AttributeError and 500s the request, even
though the write itself succeeded.

Views that need to invalidate a family of cache keys (e.g. every cached page
of an employee list) should call bust_cache_pattern() instead of
cache.delete_pattern() directly, so the exact same code works whether the
cache backend is Redis (production) or LocMemCache (local dev without Redis).
"""
from django.core.cache import cache


def bust_cache_pattern(pattern):
    """Invalidate every cache key matching `pattern` (e.g. 'employees:list:*').

    Uses Redis's native pattern delete when the active backend supports it
    (django-redis). Falls back to clearing the whole cache on backends that
    don't support pattern matching — safe here since this cache is only ever
    used for these short-TTL (5 min) list caches, so a full clear just means
    the next read repopulates it.
    """
    delete_pattern = getattr(cache, 'delete_pattern', None)
    if callable(delete_pattern):
        delete_pattern(pattern)
    else:
        cache.clear()
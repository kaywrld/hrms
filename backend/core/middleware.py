class RemoveServerHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
    def __call__(self, request):
        response = self.get_response(request)
        response.headers.pop('X-Powered-By', None)
        response.headers.pop('Server', None)
        return response


class MethodOverrideMiddleware:
    """
    Lets the frontend send a plain POST (already allowed by the server's WAF)
    while telling Django to treat it internally as PATCH/PUT/DELETE.
    Only real POST requests are eligible, and only to a safe whitelist of
    methods, so this can't be abused to smuggle arbitrary verbs.
    """
    ALLOWED_OVERRIDES = {"PATCH", "PUT", "DELETE"}

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method == "POST":
            override = request.headers.get("X-HTTP-Method-Override", "").upper()
            if override in self.ALLOWED_OVERRIDES:
                request.method = override
        return self.get_response(request)

class NoCacheAPIMiddleware:
    """
    Attendance (and other API) data changes constantly and is read straight
    back on the very next request — a stale response here silently shows
    wrong present/absent status. Without an explicit Cache-Control header,
    any intermediary sitting in front of Passenger on shared cPanel hosting
    (e.g. LiteSpeed's page cache, or a CDN) is free to cache the JSON and
    serve the same stale bytes for the same URL, even though Django itself
    never re-runs the query. This forces every /api/ response to be
    revalidated with the server every time, closing that gap.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith('/api/'):
            response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
            response.headers['Pragma'] = 'no-cache'
        return response

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

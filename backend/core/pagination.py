from rest_framework.pagination import PageNumberPagination


class StandardResultsPagination(PageNumberPagination):
    """
    Applied to every list endpoint via REST_FRAMEWORK.DEFAULT_PAGINATION_CLASS.

    page_size=1000 as the default is deliberately generous — several existing
    frontend calls (payroll list, employees list, admins list) never send a
    ?page_size= param at all and expect the *whole* list back in one response,
    since nothing in the frontend currently walks `next`/`previous` pages. A
    small default would silently truncate those to whatever page_size was,
    which is a much worse bug than "not paginated yet".

    Views that DO send their own ?page_size= (Mark Register, the daily
    Attendance view, exports) keep working exactly as before — this class
    just honors that param instead of ignoring it, up to max_page_size as a
    hard ceiling so a typo or malicious value can't force one query to return
    everything in the table.
    """
    page_size = 1000
    page_size_query_param = 'page_size'
    max_page_size = 20000
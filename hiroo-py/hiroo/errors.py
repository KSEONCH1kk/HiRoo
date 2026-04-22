class HiRooError(Exception):
    pass


class HTTPError(HiRooError):
    def __init__(self, status: int, data):
        super().__init__(f"HTTP {status}: {data}")
        self.status = status
        self.data = data


class GatewayError(HiRooError):
    pass

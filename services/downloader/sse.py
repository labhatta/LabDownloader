import asyncio
import json
import logging
from typing import AsyncGenerator, Dict, Set

logger = logging.getLogger("sse_broadcaster")

class SSEBroadcaster:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        async with self._lock:
            self._subscribers.add(queue)
        return queue

    async def unsubscribe(self, queue: asyncio.Queue):
        async with self._lock:
            self._subscribers.discard(queue)

    async def broadcast(self, event_type: str, data: dict):
        message = {
            "event": event_type,
            "data": data
        }
        async with self._lock:
            for queue in list(self._subscribers):
                try:
                    queue.put_nowait(message)
                except asyncio.QueueFull:
                    # Pop oldest item to make room for newest state, NEVER drop the subscriber!
                    try:
                        queue.get_nowait()
                        queue.put_nowait(message)
                    except Exception:
                        pass

    async def event_generator(self) -> AsyncGenerator[str, None]:
        queue = await self.subscribe()
        try:
            while True:
                try:
                    # Wait up to 15 seconds for next event; if none, send keep-alive ping
                    msg = await asyncio.wait_for(queue.get(), timeout=15.0)
                    event = msg.get("event", "message")
                    data_str = json.dumps(msg.get("data", {}))
                    yield f"event: {event}\ndata: {data_str}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await self.unsubscribe(queue)

broadcaster = SSEBroadcaster()

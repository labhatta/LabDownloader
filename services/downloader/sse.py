import asyncio
import json
from typing import AsyncGenerator, Dict, Set

class SSEBroadcaster:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
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
            stale_queues = set()
            for queue in self._subscribers:
                try:
                    queue.put_nowait(message)
                except asyncio.QueueFull:
                    stale_queues.add(queue)
            for sq in stale_queues:
                self._subscribers.discard(sq)

    async def event_generator(self) -> AsyncGenerator[str, None]:
        queue = await self.subscribe()
        try:
            while True:
                msg = await queue.get()
                event = msg.get("event", "message")
                data_str = json.dumps(msg.get("data", {}))
                yield f"event: {event}\ndata: {data_str}\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await self.unsubscribe(queue)

broadcaster = SSEBroadcaster()

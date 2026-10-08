"""A tiny fake AI server that speaks the OpenAI chat-completions protocol, for tests. Standard library only.

Point CodeCoach at it with one config line:   "ai": "mock@http://127.0.0.1:PORT/v1"

In a test:
    llm = MockLLM().start()
    llm.reply("Hello!")                                            # next answer: plain text
    llm.reply("Here you go.", tools=[("give_problem", {...})])     # next answer: text + tool calls
    ... drive the app ...
    llm.requests[-1]["messages"]                                   # what the app sent
    llm.stop()

Replies are used in order; when none are queued the server answers "OK (mock)". Streaming (stream: true) and
plain requests both work, and every answer carries a usage block (with cached_tokens) like real providers send.

From a shell (for trying the app by hand):   python3 tests/mock_llm.py --port 9911
"""
import argparse
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class MockLLM:
    def __init__(self, port=0):
        self.port = port
        self.queue = []
        self.requests = []
        self.lock = threading.Lock()
        self.httpd = None

    @property
    def url(self):
        return "http://127.0.0.1:%d/v1" % self.port

    def ai_line(self, model="mock-model"):
        return "%s@%s" % (model, self.url)

    def reply(self, content="", tools=None, usage=None, when=None):
        """Queue one answer. tools: [(name, arguments_dict), ...]. when: only use this answer once the newest
        message the app sends contains this text (earlier requests get the default answer)."""
        calls = [{"id": "call_%d_%d" % (len(self.queue), i), "type": "function",
                  "function": {"name": n, "arguments": json.dumps(a)}} for i, (n, a) in enumerate(tools or [])]
        with self.lock:
            self.queue.append({"content": content, "tool_calls": calls, "when": when,
                               "usage": usage or {"prompt_tokens": 1200, "completion_tokens": 80,
                                                  "prompt_tokens_details": {"cached_tokens": 1000}}})
        return self

    def _next(self, body):
        last = json.dumps((body.get("messages") or [{}])[-1])
        with self.lock:
            self.requests.append(body)
            for i, r in enumerate(self.queue):
                if r["when"] is None or r["when"] in last:
                    return self.queue.pop(i)
        return {"content": "OK (mock)", "tool_calls": [], "usage": {"prompt_tokens": 500, "completion_tokens": 5}}

    def start(self):
        mock = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def send(self, code, obj):
                data = json.dumps(obj).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                if self.path.rstrip("/").endswith("/models"):
                    return self.send(200, {"data": [{"id": "mock-model"}, {"id": "mock-model-large"}]})
                self.send(404, {"error": {"message": "not found"}})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"{}")
                if not self.path.endswith("/chat/completions"):
                    return self.send(404, {"error": {"message": "not found"}})
                r = mock._next(body)
                msg = {"role": "assistant", "content": r["content"]}
                if r["tool_calls"]:
                    msg["tool_calls"] = r["tool_calls"]
                if not body.get("stream"):
                    return self.send(200, {"model": body.get("model"), "usage": r["usage"],
                                           "choices": [{"index": 0, "message": msg, "finish_reason": "tool_calls" if r["tool_calls"] else "stop"}]})
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()

                def ev(obj):
                    self.wfile.write(("data: " + json.dumps(obj) + "\n\n").encode())
                    self.wfile.flush()
                text = r["content"]
                for i in range(0, len(text), 16):
                    ev({"choices": [{"index": 0, "delta": {"content": text[i:i + 16]}}]})
                for i, tc in enumerate(r["tool_calls"]):
                    a = tc["function"]["arguments"]
                    ev({"choices": [{"index": 0, "delta": {"tool_calls": [{"index": i, "id": tc["id"], "type": "function",
                                                                           "function": {"name": tc["function"]["name"], "arguments": a[:len(a) // 2]}}]}}]})
                    ev({"choices": [{"index": 0, "delta": {"tool_calls": [{"index": i, "function": {"arguments": a[len(a) // 2:]}}]}}]})
                ev({"choices": [{"index": 0, "delta": {}, "finish_reason": "tool_calls" if r["tool_calls"] else "stop"}]})
                ev({"choices": [], "model": body.get("model"), "usage": r["usage"]})
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()

        self.httpd = ThreadingHTTPServer(("127.0.0.1", self.port), H)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        return self

    def stop(self):
        if self.httpd:
            self.httpd.shutdown()
            self.httpd.server_close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=9911)
    a = ap.parse_args()
    m = MockLLM(a.port).start()
    print("Mock AI running. In CodeCoach Settings use:  " + m.ai_line())
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        m.stop()

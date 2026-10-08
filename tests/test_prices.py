"""Cost estimates for providers that only report tokens, price overrides, and the sidebar's live model suggestions."""
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server  # noqa: E402

M = 1e-6
MODELS = {
    "openai/gpt-6-luna": {"p": 1 * M, "c": 8 * M, "cr": 0.1 * M, "name": "GPT-6 Luna", "created": 300, "tools": True},
    "anthropic/claude-sonnet-5.5": {"p": 3 * M, "c": 15 * M, "cr": 0.3 * M, "name": "Claude Sonnet 5.5", "created": 400, "tools": True},
    "anthropic/claude-sonnet-5": {"p": 3 * M, "c": 15 * M, "cr": None, "name": "Claude Sonnet 5", "created": 100, "tools": True},
    "google/gemini-3.8-flash": {"p": 0.3 * M, "c": 2.5 * M, "cr": None, "name": "Gemini 3.8 Flash", "created": 350, "tools": True},
    "google/gemini-3.9-flash-preview": {"p": 0.3 * M, "c": 2.5 * M, "cr": None, "name": "Gemini 3.9 Flash Preview", "created": 999, "tools": True},
    "deepseek/deepseek-v4.1-flash": {"p": 0.3 * M, "c": 1.2 * M, "cr": 0.006 * M, "name": "DeepSeek V4.1 Flash", "created": 200, "tools": True},
    "deepseek/deepseek-v4-flash": {"p": 0.3 * M, "c": 1.2 * M, "cr": None, "name": "DeepSeek V4 Flash", "created": 50, "tools": True},
    "meta/llama-9:free": {"p": 0, "c": 0, "cr": None, "name": "Llama 9 (free)", "created": 500, "tools": True},
    "meta/llama-8:free": {"p": 0, "c": 0, "cr": None, "name": "Llama 8 (free)", "created": 450, "tools": False},
    "mistralai/mistral-large-3": {"p": 2 * M, "c": 6 * M, "cr": None, "name": "Mistral Large 3", "created": 10, "tools": True},
}


class PricesTest(unittest.TestCase):
    def setUp(self):
        self.old = server.LOCAL_DIR
        server.LOCAL_DIR = tempfile.mkdtemp(prefix="cc-prices-")
        server.PRICE_STATE.update(key=None, ov_key=None)
        server.write_text(server.prices_file(), json.dumps({"fetched_at": time.time(), "updated": server.today(), "models": MODELS}))
        self.cfg = dict(server.DEFAULT_CONFIG)

    def tearDown(self):
        shutil.rmtree(server.LOCAL_DIR, ignore_errors=True)
        server.LOCAL_DIR = self.old

    def cost(self, line, usage):
        self.cfg["ai"] = line
        return server.add_cost(self.cfg, dict(usage))

    def test_direct_providers_map_to_published_prices(self):
        u = self.cost("openai:gpt-6-luna", {"prompt_tokens": 1000000, "completion_tokens": 100000})
        self.assertAlmostEqual(u["cost"], 1 + 0.8)
        self.assertTrue(u["cost_estimated"])
        self.assertAlmostEqual(self.cost("anthropic:claude-sonnet-5-5-20260301", {"prompt_tokens": 1000000})["cost"], 3)   # dashes, date
        self.assertAlmostEqual(self.cost("gemini:models/gemini-3.8-flash", {"completion_tokens": 1000000})["cost"], 2.5)
        self.assertAlmostEqual(self.cost("mistral:mistral-large-3", {"prompt_tokens": 1000000})["cost"], 2)

    def test_cached_input_is_cheaper(self):
        u = self.cost("deepseek:deepseek-v4.1-flash", {"prompt_tokens": 1000000, "completion_tokens": 0, "prompt_cache_hit_tokens": 900000})
        self.assertAlmostEqual(u["cost"], 0.1 * 0.3 + 0.9 * 0.006)
        u = self.cost("anthropic:claude-sonnet-5", {"prompt_tokens": 1000000, "prompt_tokens_details": {"cached_tokens": 500000}})
        self.assertAlmostEqual(u["cost"], 3)      # no cached price published: full price

    def test_groq_and_custom_servers_match_by_model_name(self):
        self.assertAlmostEqual(self.cost("groq:mistral-large-3", {"prompt_tokens": 1000000})["cost"], 2)

    def test_reported_cost_is_kept(self):
        u = self.cost("openrouter:openai/gpt-6-luna", {"prompt_tokens": 1000000, "cost": 0.5})
        self.assertEqual(u["cost"], 0.5)
        self.assertNotIn("cost_estimated", u)

    def test_local_is_free_and_unknown_is_flagged(self):
        u = self.cost("ollama:qwen3:14b", {"prompt_tokens": 5000})
        self.assertEqual(u["cost"], 0)
        self.assertNotIn("cost_estimated", u)
        server.PRICE_STATE["fetching"] = True          # don't start a real download from the test
        try:
            u = self.cost("openai:gpt-unknown", {"prompt_tokens": 5000})
        finally:
            server.PRICE_STATE["fetching"] = False
        self.assertNotIn("cost", u)
        self.assertTrue(u["cost_unknown"])

    def test_overrides_win(self):
        server.write_text(os.path.join(server.LOCAL_DIR, "price_overrides.json"),
                          json.dumps({"openai:gpt-6-luna": {"input": 2, "output": 10}, "my-model@http://10.0.0.5/v1": {"input": 1, "output": 1}}))
        self.assertAlmostEqual(self.cost("openai:gpt-6-luna", {"prompt_tokens": 1000000, "prompt_tokens_details": {"cached_tokens": 1000000}})["cost"], 2)
        self.assertAlmostEqual(self.cost("my-model@http://10.0.0.5/v1", {"prompt_tokens": 1000000, "completion_tokens": 1000000})["cost"], 2)

    def test_suggested_models_are_newest_per_family(self):
        ids = [m[0] for m in server.suggested_models()]
        self.assertIn("deepseek/deepseek-v4.1-flash", ids)
        self.assertNotIn("deepseek/deepseek-v4-flash", ids)
        self.assertIn("google/gemini-3.8-flash", ids)                  # the newer one is a preview
        self.assertIn("anthropic/claude-sonnet-5.5", ids)
        self.assertIn("meta/llama-9:free", ids)
        self.assertNotIn("meta/llama-8:free", ids)                      # can't use tools
        labels = dict(server.suggested_models())
        self.assertEqual(labels["deepseek/deepseek-v4.1-flash"], "DeepSeek V4.1 Flash (cheap)")
        self.assertEqual(labels["meta/llama-9:free"], "Llama 9 (free)")

    def test_no_price_list_yet(self):
        os.remove(server.prices_file())
        self.assertEqual(server.suggested_models(), [])


if __name__ == "__main__":
    unittest.main()

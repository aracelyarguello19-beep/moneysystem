"use strict";

const assert = require("assert");
const {
  hasThemeSignal,
  inferThemeFromDesignMd,
  isPlaceholderThemeSignal,
} = require("./theme-inference.cjs");

{
  const theme = inferThemeFromDesignMd("Supabase is a dark-mode-native developer platform with near-black backgrounds.", {
    preview_tokens: { surface_bg: "#fafafa" },
  });
  assert.equal(theme.default, "dark");
  assert.equal(theme.confidence, "medium");
}

{
  const theme = inferThemeFromDesignMd("A warm-cream editorial canvas instead of the typical dark IDE atmosphere.", {
    preview_tokens: { surface_bg: "#f7f7f4" },
  });
  assert.equal(theme.default, "light");
}

{
  const theme = inferThemeFromDesignMd("xAI is dark-first brutalist minimalism with an almost-black background.", {
    preview_tokens: { surface_bg: "#ffffff" },
  });
  assert.equal(theme.default, "dark");
}

{
  const theme = inferThemeFromDesignMd("IBM operates on a stark duality: a bright white (`#ffffff`) canvas with near-black text. Dark Theme Variant: Gray 100 dark backgrounds are also available.", {
    preview_tokens: { surface_bg: "#ffffff" },
  });
  assert.equal(theme.default, "light");
}

{
  const theme = inferThemeFromDesignMd("OpenCode's entire visual system is built on a near-black background with warm off-white text.", {
    preview_tokens: { surface_bg: "#fdfcfc" },
  });
  assert.equal(theme.default, "dark");
}

{
  const placeholder = { default: "light", signals: ["awesome-design-md-import"] };
  assert.equal(isPlaceholderThemeSignal(placeholder), true);
  assert.equal(hasThemeSignal(placeholder), false);
}

console.log("theme-inference tests passed");

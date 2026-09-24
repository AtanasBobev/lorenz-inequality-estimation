import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "none",
          varsIgnorePattern: "^_"
        }
      ],
      "no-useless-assignment": "off"
    }
  },
  {
    ignores: ["dist/", "node_modules/", "docs/", "coverage/", "*.docx", "*.png", "*.pdf"]
  }
);

// Lint rules are part of the architecture (REWORK_PLAN.md section 8): the layer
// boundaries below are what keeps src/ traceable when nobody reads the code.
import vue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'

/** Layers, lowest first. A layer may import from itself and from the ones before it. */
const LAYERS = ['domain', 'data', 'services', 'ui', 'features', 'app']

/** Import patterns `layer` must not use: every layer above it. */
function forbiddenFor(layer) {
  const above = LAYERS.slice(LAYERS.indexOf(layer) + 1)
  return above.map(l => ({ group: [`@/${l}/**`, `@/${l}`], message: `${layer}/ must not import from ${l}/ (REWORK_PLAN.md §8)` }))
}

export default tseslint.config(
  { ignores: ['dist/**', 'legacy/**', 'node_modules/**', 'dev-dist/**'] },
  ...tseslint.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/multi-word-component-names': 'off',
      'no-restricted-globals': ['error',
        { name: 'confirm', message: 'Use the app dialog (ui/dialogs).' },
        { name: 'alert', message: 'Use notices (ui/notices).' },
        { name: 'prompt', message: 'Use the app dialog (ui/dialogs).' }],
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'no-restricted-imports': ['error', { patterns: [{ group: ['**/legacy/**'], message: 'src/ never imports from legacy/.' }] }],
    },
  },
  ...LAYERS.slice(0, -1).map(layer => ({
    files: [`src/${layer}/**`],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/legacy/**'], message: 'src/ never imports from legacy/.' },
          ...forbiddenFor(layer),
          // Features talk through domain events and the layers below, never to each other
          ...(layer === 'features' ? [] : []),
        ],
      }],
    },
  })),
  {
    // Only data/ opens the database
    files: ['src/domain/**', 'src/services/**', 'src/ui/**', 'src/features/**', 'src/app/**'],
    rules: { 'no-restricted-syntax': ['error',
      { selector: "ImportDeclaration[source.value='dexie']", message: 'Only src/data/ talks to IndexedDB.' },
      { selector: "ImportDeclaration[source.value='@/data/db']", message: 'Only src/data/ opens the database; use a repository.' }] },
  },
  {
    files: ['src/domain/**'],
    rules: { 'no-restricted-syntax': ['error',
      { selector: "ImportDeclaration[source.value='dexie']", message: 'domain/ is pure.' },
      { selector: "ImportDeclaration[source.value='vue']", message: 'domain/ is pure: no Vue.' }] },
  },
  {
    // Foundry and pf2ools documents are other people's JSON: no types of ours describe them
    files: ['src/domain/foundry/**', 'src/domain/pf2ools/**', 'tests/rules/**'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  { files: ['tests/**'], rules: { 'max-lines': 'off' } },
)

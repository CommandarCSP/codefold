import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const workspacePackages = {
  group: ['@codefold/*'],
  message:
    '헤드리스 패키지끼리는 서로 import하지 않습니다. 조립은 @codefold/react-code-editor에서만 합니다 (ADR-0022).',
};
const zipFromReact = {
  group: ['@codefold/zip-archive', '@codefold/zip-editor'],
  message:
    '@codefold/react-code-editor는 ZIP을 모릅니다. 파일 출처는 FileSource로 받습니다 (ADR-0022).',
};
const react = {
  group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
  message: '패키지는 React에 의존하지 않습니다 (ADR-0003, ADR-0016).',
};
const nodeModules = {
  group: ['node:*'],
  message: '헤드리스 패키지는 브라우저에서 돈다. Node 모듈을 쓰지 않는다 (ADR-0016).',
};
const monaco = {
  group: ['monaco-editor', 'monaco-editor/*'],
  message: 'Monaco는 packages/monaco-binding에서만 다룹니다 (ADR-0016).',
};

function restrictImports(...patterns) {
  return { 'no-restricted-imports': ['error', { patterns }] };
}

export default defineConfig([
  globalIgnores([
    '**/dist',
    '**/coverage',
    '**/playwright-report',
    '**/test-results',
    // vercel build(배포)가 저장소 루트에 남기는 빌드 결과
    '**/.vercel',
  ]),
  {
    files: ['**/*.{ts,tsx,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['packages/{zip-archive,file-type-detector,virtual-fs}/src/**/*.ts'],
    rules: restrictImports(workspacePackages, react, monaco, nodeModules),
  },
  {
    files: ['packages/monaco-binding/src/**/*.ts'],
    rules: restrictImports(workspacePackages, react, nodeModules),
  },
  {
    files: ['packages/react-code-editor/src/**/*.{ts,tsx}'],
    rules: restrictImports(zipFromReact),
  },
  {
    files: ['apps/zip-editor/**/*.{ts,tsx}', 'packages/react-code-editor/**/*.{ts,tsx}'],
    extends: [
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
  },
  {
    // 에디터 코드(dockview·Monaco)는 첫 화면 번들에 넣지 않는다. 값 import는 EditorHost(지연 로딩)와
    // Monaco worker 생성 함수에서만 한다. 타입 import는 된다 (ADR-0022, ADR-0027, FR-11)
    files: ['apps/zip-editor/src/**/*.{ts,tsx}'],
    ignores: [
      'apps/zip-editor/src/components/domain/workspace/EditorHost.tsx',
      'apps/zip-editor/src/services/monaco/**',
    ],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@codefold/react-code-editor',
                '@codefold/react-code-editor/*',
                'monaco-editor',
                'monaco-editor/*',
                'dockview',
                'dockview-core',
                'dockview-react',
              ],
              allowTypeImports: true,
              message:
                '에디터 코드는 첫 화면 번들에 넣지 않습니다. EditorHost(지연 로딩)에서만 값으로 import합니다 (ADR-0027, FR-11).',
            },
          ],
        },
      ],
    },
  },
  {
    // shadcn/ui 부품은 컴포넌트와 variants를 한 파일에서 내보내는 형식을 그대로 따른다
    files: ['apps/zip-editor/src/components/ui/**/*.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
  {
    files: ['**/*.config.{ts,js}', 'apps/zip-editor/e2e/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
]);

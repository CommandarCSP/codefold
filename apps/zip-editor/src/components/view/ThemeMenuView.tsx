// apps/zip-editor/src/components/view/ThemeMenuView.tsx
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { messages } from '@/utils/messages';

type Preference = 'light' | 'dark' | 'system';

export interface ThemeMenuViewProps {
  readonly preference: Preference;
  readonly resolved: 'light' | 'dark';
  readonly onChange: (preference: Preference) => void;
}

const options: ReadonlyArray<{ readonly value: Preference; readonly label: string }> = [
  { value: 'light', label: messages.theme.light },
  { value: 'dark', label: messages.theme.dark },
  { value: 'system', label: messages.theme.system },
];

/** 상단 막대 오른쪽의 테마 메뉴. */
export function ThemeMenuView({ preference, resolved, onChange }: ThemeMenuViewProps) {
  const Icon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={messages.theme.label}>
          <Icon aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => {
            const picked = options.find((option) => option.value === value);
            if (picked) onChange(picked.value);
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

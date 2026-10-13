// apps/zip-editor/src/components/view/EnvironmentNoticeViews.tsx
import { Globe, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { messages } from '@/utils/messages';

interface NoticePageProps {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description: string;
  readonly children?: ReactNode;
}

function NoticePage({ icon, title, description, children }: NoticePageProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-8 text-foreground">
      <section className="flex max-w-md flex-col items-center gap-3 text-center">
        {icon}
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        {children}
      </section>
    </main>
  );
}

/** 보안 연결이 아닐 때 앱 대신 보인다. */
export function InsecureContextNoticeView() {
  return (
    <NoticePage
      icon={<ShieldAlert aria-hidden className="size-10 text-muted-foreground" />}
      title={messages.insecure.title}
      description={messages.insecure.description}
    />
  );
}

/** 필요한 기능이 없을 때 앱 대신 보인다. */
export function UnsupportedBrowserNoticeView() {
  return (
    <NoticePage
      icon={<Globe aria-hidden className="size-10 text-muted-foreground" />}
      title={messages.unsupported.title}
      description={messages.unsupported.description}
    >
      <ul className="flex gap-3 text-sm font-medium">
        {messages.unsupported.browsers.map((browser) => (
          <li key={browser}>{browser}</li>
        ))}
      </ul>
    </NoticePage>
  );
}

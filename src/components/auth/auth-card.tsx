import { Logo } from "@/components/layout/logo";
import { Card, CardBody } from "@/components/ui/card";

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-sand-50 to-sage-100/70 px-4 py-10"
    >
      <Logo className="mb-6" />
      <Card className="w-full max-w-md">
        <CardBody className="sm:p-8">
          <h1 className="text-2xl font-extrabold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-forest-600">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </CardBody>
      </Card>
      {footer && <div className="mt-5 text-sm text-forest-700">{footer}</div>}
    </main>
  );
}

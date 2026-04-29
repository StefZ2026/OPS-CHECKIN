import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import SiteShell from "@/components/SiteShell";

export default function NotFound() {
  return (
    <SiteShell>
      <div className="flex-1 flex items-center justify-center p-6 min-h-[calc(100vh-8rem)]">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="inline-flex items-center justify-center w-32 h-32 bg-destructive rounded-full border-8 border-foreground shadow-brutal mb-4">
            <AlertCircle className="w-16 h-16 text-white" />
          </div>
          <div className="space-y-4">
            <h1 className="font-display text-5xl md:text-6xl uppercase tracking-tighter">404</h1>
            <p className="text-2xl font-bold text-foreground">Page not found</p>
            <p className="text-lg text-muted-foreground font-medium">
              Looks like you've wandered off the protest path.
            </p>
          </div>
          <Link href="/">
            <Button size="xl" className="w-full">
              Back to Home
            </Button>
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}

import { useLocation } from "wouter";
import { Dumbbell, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const [, navigate] = useLocation();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-8">
      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
        <Dumbbell className="w-10 h-10 text-muted-foreground" />
      </div>
      <div className="text-center">
        <h1 className="text-4xl font-black mb-2">404</h1>
        <p className="text-lg font-semibold mb-1">Page not found</p>
        <p className="text-sm text-muted-foreground">
          The page you're looking for doesn't exist.
        </p>
      </div>
      <Button onClick={() => navigate("/")} className="gap-2" data-testid="button-go-home">
        <ArrowLeft className="w-4 h-4" />
        Go Home
      </Button>
    </div>
  );
}

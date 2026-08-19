import { Loader2 } from "lucide-react";

export default function PageLoading() {
  return (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center p-8">
      <Loader2 className="size-6 animate-spin text-slate-400" />
    </div>
  );
}

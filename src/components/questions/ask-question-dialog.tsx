"use client";

import { MessageCirclePlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { askQuestionAction } from "@/app/(app)/questions/actions";
import { MentionComposer, type MentionableMember } from "@/components/tasks/mention-composer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildHref, normalizeSearchParams } from "@/lib/urls";

/** Ask the project a question; afterwards the new question opens, so the discussion starts where it was asked. */
export function AskQuestionDialog({ projectId, members }: { projectId: string; members: MentionableMember[] }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <>
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <MessageCirclePlus /> Frage stellen
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Frage stellen</DialogTitle>
            <DialogDescription>Alle im Projekt können antworten. Wer mit @ erwähnt wird, bekommt eine Benachrichtigung.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="question-title">Titel</Label>
            <Input id="question-title" value={title} maxLength={200} autoFocus onChange={(event) => setTitle(event.target.value)} />
          </div>
          <MentionComposer
            members={members}
            rows={5}
            label="Fragetext"
            placeholder="Was möchtest du wissen? @ für Erwähnungen"
            submitLabel="Frage stellen"
            onSave={async (body) => {
              const result = await askQuestionAction(projectId, { title, body });
              if (result.ok) {
                setOpen(false);
                setTitle("");
                router.push(buildHref(pathname, normalizeSearchParams(Object.fromEntries(searchParams.entries())), { frage: result.data.id }));
              }
              return result;
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

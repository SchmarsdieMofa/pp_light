"use client";

import { Settings2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FolderDialog } from "./folder-dialog";

/** Opens the folder dialog (name, projects, people). */
export function FolderManageButton({ folderId, folderName }: { folderId: string; folderName: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" aria-label={`Ordner ${folderName} verwalten`} onClick={() => setOpen(true)}>
        <Settings2 /> Verwalten
      </Button>
      {open && <FolderDialog folderId={folderId} open onOpenChange={setOpen} />}
    </>
  );
}

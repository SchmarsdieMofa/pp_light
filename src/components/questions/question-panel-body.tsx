"use client";

import { useRouter } from "next/navigation";
import type { MentionableMember } from "@/components/tasks/mention-composer";
import type { QuestionDetail } from "@/server/questions/service";
import { QuestionThread } from "./question-thread";

/** The thread inside the overlay; a deleted question closes it. */
export function QuestionPanelBody(props: { detail: QuestionDetail; members: MentionableMember[]; viewerId: string; closeHref: string }) {
  const router = useRouter();
  return <QuestionThread detail={props.detail} members={props.members} viewerId={props.viewerId} onDeleted={() => router.push(props.closeHref, { scroll: false })} />;
}

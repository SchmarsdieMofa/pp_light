import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownText } from "@/components/tasks/markdown-text";

describe("MarkdownText", () => {
  it("renders Markdown, but never loads remote images or follows script links", () => {
    const html = renderToStaticMarkup(<MarkdownText text={'**Fett** <script>alert(1)</script> [Falle](javascript:alert(1)) ![extern](https://evil.test/track.png)'} />);
    expect(html).toContain("<strong>Fett</strong>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("href=\"javascript:");
    expect(html).not.toContain("<img");
    expect(html).toContain("Bild: extern");
  });

  it("highlights verified mentions and opens allowed links safely", () => {
    const id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
    const html = renderToStaticMarkup(<MarkdownText text={`Hallo @[Ada](user:${id}) [Website](https://example.com)`} mentionIds={[id]} />);
    expect(html).toContain("@<span");
    expect(html).toContain(">Ada</span>");
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});

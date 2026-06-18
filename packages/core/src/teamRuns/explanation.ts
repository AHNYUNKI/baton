export function extractExplanation(stdout: string): string | undefined {
  const headingPattern = /^##[ \t]+학습 설명[ \t]*$/gm;
  let heading: RegExpExecArray | null = null;

  for (let match = headingPattern.exec(stdout); match !== null; match = headingPattern.exec(stdout)) {
    heading = match;
  }

  if (heading === null) {
    return undefined;
  }

  const sectionStart = heading.index;
  const afterHeading = sectionStart + heading[0].length;
  const nextHeadingPattern = /^##[ \t]+/gm;
  nextHeadingPattern.lastIndex = afterHeading;
  const nextHeading = nextHeadingPattern.exec(stdout);
  const sectionEnd = nextHeading?.index ?? stdout.length;
  return stdout.slice(sectionStart, sectionEnd).trim();
}

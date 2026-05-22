import { useCallback, useEffect, useState } from "react";

export function useChangelogDialog(input: {
  setAnnouncement: (message: string) => void;
}) {
  const { setAnnouncement } = input;
  const [changelogOpen, setChangelogOpen] = useState(false);

  const openChangelog = useCallback(() => {
    setChangelogOpen(true);
    setAnnouncement("Opened PharosVille changelog.");
  }, [setAnnouncement]);

  const closeChangelog = useCallback(() => {
    setChangelogOpen(false);
    setAnnouncement("Closed PharosVille changelog.");
  }, [setAnnouncement]);

  useEffect(() => {
    if (!changelogOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeChangelog();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [changelogOpen, closeChangelog]);

  return {
    changelogOpen,
    closeChangelog,
    openChangelog,
  };
}

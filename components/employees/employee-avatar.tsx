"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function EmployeeAvatar({
  name,
  imageUrl,
  large = false,
}: {
  name: string;
  imageUrl: string | null;
  large?: boolean;
}) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <Avatar
      size={large ? "lg" : "default"}
      className={large ? "size-12" : undefined}
    >
      {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  );
}

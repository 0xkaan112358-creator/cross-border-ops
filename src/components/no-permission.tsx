import { ShieldAlert } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "./ui/empty";

export function NoPermission({ need }: { need: string }) {
  return (
    <Empty className="mt-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldAlert />
        </EmptyMedia>
        <EmptyTitle>没有访问权限</EmptyTitle>
        <EmptyDescription>这个页面仅{need}可以使用。如需开通，请联系管理员在"设置 &gt; 成员角色"中添加。</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

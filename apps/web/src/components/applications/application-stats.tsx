import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ApplicationStatsProps {
  userCount: number;
  sessionCount: number;
}

export function ApplicationStats({
  userCount,
  sessionCount,
}: ApplicationStatsProps) {
  return (
    <div className="mb-8 grid grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Total Users</CardDescription>
          <CardTitle className="text-3xl">{userCount}</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardDescription>Active Sessions</CardDescription>
          <CardTitle className="text-3xl">{sessionCount}</CardTitle>
        </CardHeader>
      </Card>
    </div>
  );
}

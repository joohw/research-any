// user_agent_tasks 表已废弃：日报仅来自 app/config/dailyReports.json + user_daily_subscriptions

export interface AgentTask {
  title: string;
  prompt?: string;
  description?: string;
  refresh?: number;
}

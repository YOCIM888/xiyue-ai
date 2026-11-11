import { useWorkspaceShell } from './useWorkspaceShell'
import { useWorkspaceTree } from './useWorkspaceTree'
import { useWorkspaceViews } from './useWorkspaceViews'
import { useWorkspaceActions } from './useWorkspaceActions'

/**
 * 工作区面板的组合入口：外壳状态、文件树、侧栏视图与写操作共享同一个 ctx。
 * 拆成多个 composable 是为了让每块逻辑各自可读、可测，同时保持原来的公共行为不变。
 */
export function useWorkspacePanel() {
  const ctx = {}
  Object.assign(ctx, useWorkspaceShell(ctx))
  Object.assign(ctx, useWorkspaceTree(ctx))
  Object.assign(ctx, useWorkspaceViews(ctx))
  Object.assign(ctx, useWorkspaceActions(ctx))
  return ctx
}

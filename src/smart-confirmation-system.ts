import { ContentQualityAssessor, QualityAssessmentResult } from './content-quality-assessor.js';
import { ContextType } from './types.js';

export interface ConfirmationRequest {
  content: string;
  type: ContextType;
  assessment: QualityAssessmentResult;
  sessionId: string;
  metadata?: Record<string, any>;
}

export interface ConfirmationResponse {
  action: 'record' | 'discard' | 'pending';
  contextId?: string;
  reason: string;
  confidence: number;
}

export interface ConfirmationPrompt {
  message: string;
  options: ConfirmationOption[];
  timeout?: number; // 超时时间（毫秒）
}

export interface ConfirmationOption {
  label: string;
  value: 'yes' | 'no' | 'maybe';
  description?: string;
}

export class SmartConfirmationSystem {
  private qualityAssessor: ContentQualityAssessor;
  private pendingConfirmations: Map<string, ConfirmationRequest> = new Map();
  private userPreferences: UserPreferences = {
    autoConfirmThreshold: 0.8,
    askConfirmThreshold: 0.4,
    preferredConfirmationStyle: 'concise',
    autoConfirmTypes: ['ERROR', 'SOLUTION'],
    neverConfirmTypes: [],
    timeoutDuration: 30000 // 30秒
  };

  constructor(qualityAssessor: ContentQualityAssessor) {
    this.qualityAssessor = qualityAssessor;
  }

  /**
   * 处理内容确认请求
   */
  async processConfirmationRequest(
    content: string,
    type: ContextType,
    sessionId: string,
    projectContext?: any,
    metadata?: Record<string, any>
  ): Promise<ConfirmationResponse> {
    
    // 1. 质量评估
    const assessment = this.qualityAssessor.assessContent(
      content, 
      type, 
      projectContext, 
      metadata
    );

    const request: ConfirmationRequest = {
      content,
      type,
      assessment,
      sessionId,
      metadata
    };

    // 2. 基于评估结果和用户偏好决定动作
    return await this.determineConfirmationAction(request);
  }

  /**
   * 确定确认动作
   */
  private async determineConfirmationAction(request: ConfirmationRequest): Promise<ConfirmationResponse> {
    const { assessment, type } = request;
    const score = assessment.score;

    // 检查用户偏好中的自动确认类型
    if (this.userPreferences.autoConfirmTypes.includes(type.toString().toUpperCase())) {
      if (score >= 0.6) { // 降低自动确认阈值
        return this.createAutoRecordResponse(request, '用户偏好自动确认此类型内容');
      }
    }

    // 检查用户偏好中的从不确认类型
    if (this.userPreferences.neverConfirmTypes.includes(type.toString().toUpperCase())) {
      return this.createDiscardResponse(request, '用户偏好不记录此类型内容');
    }

    // 基于质量分数决定动作
    switch (assessment.recommendation) {
      case 'auto_record':
        return this.createAutoRecordResponse(request, assessment.reasoning);
        
      case 'discard':
        return this.createDiscardResponse(request, assessment.reasoning);
        
      case 'ask_user':
        return await this.createUserConfirmationResponse(request);
        
      default:
        return this.createDiscardResponse(request, '未知推荐动作');
    }
  }

  /**
   * 创建自动记录响应
   */
  private createAutoRecordResponse(request: ConfirmationRequest, reason: string): ConfirmationResponse {
    return {
      action: 'record',
      reason: `自动记录: ${reason} (质量分: ${request.assessment.score.toFixed(2)})`,
      confidence: request.assessment.confidence
    };
  }

  /**
   * 创建丢弃响应
   */
  private createDiscardResponse(request: ConfirmationRequest, reason: string): ConfirmationResponse {
    return {
      action: 'discard',
      reason: `自动丢弃: ${reason} (质量分: ${request.assessment.score.toFixed(2)})`,
      confidence: request.assessment.confidence
    };
  }

  /**
   * 创建用户确认响应
   */
  private async createUserConfirmationResponse(request: ConfirmationRequest): Promise<ConfirmationResponse> {
    // 生成确认提示
    const prompt = this.generateConfirmationPrompt(request);
    
    // 存储待确认请求
    const confirmationId = this.generateConfirmationId();
    this.pendingConfirmations.set(confirmationId, request);

    // 设置超时处理
    this.setupConfirmationTimeout(confirmationId);

    return {
      action: 'pending',
      reason: `等待用户确认: ${prompt.message}`,
      confidence: request.assessment.confidence,
      // 在实际MCP实现中，这里会通过MCP接口向用户显示确认提示
    };
  }

  /**
   * 生成确认提示
   */
  private generateConfirmationPrompt(request: ConfirmationRequest): ConfirmationPrompt {
    const { content, type, assessment } = request;
    const score = assessment.score;
    const contentPreview = this.getContentPreview(content, 100);

    let message: string;
    let options: ConfirmationOption[];

    // 基于内容类型生成不同的提示
    switch (type) {
      case ContextType.CODE:
        message = `发现${this.getQualityDescription(score)}代码片段，是否记录到DevMind？\n` +
                 `内容预览: ${contentPreview}\n` +
                 `评估: ${assessment.reasoning}`;
        options = [
          { label: '记录', value: 'yes', description: '将此代码保存到项目记忆中' },
          { label: '跳过', value: 'no', description: '不保存此代码' },
          { label: '暂时保留', value: 'maybe', description: '稍后决定' }
        ];
        break;

      case ContextType.CONVERSATION:
        message = `发现${this.getQualityDescription(score)}对话内容，是否记录？\n` +
                 `内容预览: ${contentPreview}\n` +
                 `评估: ${assessment.reasoning}`;
        options = [
          { label: '记录', value: 'yes', description: '保存这段对话' },
          { label: '跳过', value: 'no', description: '不保存' }
        ];
        break;

      case ContextType.SOLUTION:
        message = `发现解决方案，看起来${this.getQualityDescription(score)}，是否记录？\n` +
                 `内容预览: ${contentPreview}`;
        options = [
          { label: '记录', value: 'yes', description: '保存解决方案以备后用' },
          { label: '跳过', value: 'no', description: '不保存' }
        ];
        break;

      case ContextType.ERROR:
        message = `遇到错误信息，是否记录用于学习？\n` +
                 `错误预览: ${contentPreview}`;
        options = [
          { label: '记录', value: 'yes', description: '保存错误信息和解决过程' },
          { label: '跳过', value: 'no', description: '这是临时错误，不需要记录' }
        ];
        break;

      default:
        message = `发现${this.getTypeDescription(type)}内容，质量评估: ${this.getQualityDescription(score)}\n` +
                 `内容预览: ${contentPreview}\n` +
                 `是否记录？`;
        options = [
          { label: '记录', value: 'yes' },
          { label: '跳过', value: 'no' }
        ];
    }

    return {
      message,
      options,
      timeout: this.userPreferences.timeoutDuration
    };
  }

  /**
   * 处理用户确认响应
   */
  async handleUserConfirmation(
    confirmationId: string, 
    userChoice: 'yes' | 'no' | 'maybe'
  ): Promise<ConfirmationResponse> {
    
    const request = this.pendingConfirmations.get(confirmationId);
    if (!request) {
      return {
        action: 'discard',
        reason: '确认请求已过期或不存在',
        confidence: 0
      };
    }

    // 清理待确认请求
    this.pendingConfirmations.delete(confirmationId);

    // 根据用户选择返回响应
    switch (userChoice) {
      case 'yes':
        return {
          action: 'record',
          reason: `用户确认记录 (质量分: ${request.assessment.score.toFixed(2)})`,
          confidence: 1.0 // 用户确认的置信度最高
        };
        
      case 'no':
        return {
          action: 'discard',
          reason: `用户选择不记录 (质量分: ${request.assessment.score.toFixed(2)})`,
          confidence: 1.0
        };
        
      case 'maybe':
        // 暂时保留，可以实现为延后处理
        return {
          action: 'pending',
          reason: '用户选择暂时保留，等待后续决定',
          confidence: 0.5
        };
        
      default:
        return {
          action: 'discard',
          reason: '无效的用户选择',
          confidence: 0
        };
    }
  }

  /**
   * 批量确认处理 - 用于处理多个类似内容
   */
  async processBatchConfirmation(
    requests: Array<{
      content: string;
      type: ContextType;
      sessionId: string;
      metadata?: Record<string, any>;
    }>,
    projectContext?: any
  ): Promise<ConfirmationResponse[]> {
    
    const responses: ConfirmationResponse[] = [];
    
    // 按类型分组处理
    const groupedRequests = this.groupRequestsByType(requests);
    
    for (const [type, typeRequests] of groupedRequests) {
      // 计算平均质量分数
      const assessments = typeRequests.map(req => 
        this.qualityAssessor.assessContent(req.content, req.type, projectContext, req.metadata)
      );
      
      const avgScore = assessments.reduce((sum, assessment) => sum + assessment.score, 0) / assessments.length;
      
      // 基于平均分数决定批量处理策略
      if (avgScore >= this.userPreferences.autoConfirmThreshold) {
        // 批量自动确认
        for (let i = 0; i < typeRequests.length; i++) {
          responses.push({
            action: 'record',
            reason: `批量自动记录${this.getTypeDescription(type as ContextType)}`,
            confidence: assessments[i].confidence
          });
        }
      } else if (avgScore < this.userPreferences.askConfirmThreshold) {
        // 批量丢弃
        for (let i = 0; i < typeRequests.length; i++) {
          responses.push({
            action: 'discard',
            reason: `批量丢弃低质量${this.getTypeDescription(type as ContextType)}`,
            confidence: assessments[i].confidence
          });
        }
      } else {
        // 需要用户确认
        for (let i = 0; i < typeRequests.length; i++) {
          const response = await this.processConfirmationRequest(
            typeRequests[i].content,
            typeRequests[i].type,
            typeRequests[i].sessionId,
            projectContext,
            typeRequests[i].metadata
          );
          responses.push(response);
        }
      }
    }
    
    return responses;
  }

  /**
   * 更新用户偏好
   */
  updateUserPreferences(preferences: Partial<UserPreferences>): void {
    this.userPreferences = { ...this.userPreferences, ...preferences };
  }

  /**
   * 获取用户偏好
   */
  getUserPreferences(): UserPreferences {
    return { ...this.userPreferences };
  }

  /**
   * 获取待确认请求统计
   */
  getPendingConfirmationsStats(): {
    total: number;
    byType: Record<string, number>;
    oldestPending: Date | null;
  } {
    const byType: Record<string, number> = {};
    let oldestTime = Date.now();
    
    for (const request of this.pendingConfirmations.values()) {
      const typeKey = request.type.toString();
      byType[typeKey] = (byType[typeKey] || 0) + 1;
    }
    
    return {
      total: this.pendingConfirmations.size,
      byType,
      oldestPending: this.pendingConfirmations.size > 0 ? new Date(oldestTime) : null
    };
  }

  // 私有辅助方法

  private generateConfirmationId(): string {
    return `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupConfirmationTimeout(confirmationId: string): void {
    setTimeout(() => {
      if (this.pendingConfirmations.has(confirmationId)) {
        // 超时处理：默认丢弃
        this.pendingConfirmations.delete(confirmationId);
        // 这里可以记录超时日志或触发清理事件
      }
    }, this.userPreferences.timeoutDuration);
  }

  private getContentPreview(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }

  private getQualityDescription(score: number): string {
    if (score >= 0.8) return '高质量';
    if (score >= 0.6) return '中等质量';
    if (score >= 0.4) return '一般质量';
    return '低质量';
  }

  private getTypeDescription(type: ContextType): string {
    const descriptions: Record<string, string> = {
      [ContextType.CODE_CREATE]: '代码创建',
      [ContextType.CODE_MODIFY]: '代码修改',
      [ContextType.CODE_DELETE]: '代码删除',
      [ContextType.CODE_REFACTOR]: '代码重构',
      [ContextType.CODE_OPTIMIZE]: '代码优化',
      [ContextType.BUG_FIX]: '修复Bug',
      [ContextType.BUG_REPORT]: 'Bug报告',
      [ContextType.FEATURE_ADD]: '功能新增',
      [ContextType.FEATURE_UPDATE]: '功能更新',
      [ContextType.FEATURE_REMOVE]: '功能移除',
      [ContextType.CODE]: '代码',
      [ContextType.CONVERSATION]: '对话',
      [ContextType.ERROR]: '错误信息',
      [ContextType.SOLUTION]: '解决方案',
      [ContextType.DOCUMENTATION]: '文档',
      [ContextType.TEST]: '测试',
      [ContextType.CONFIGURATION]: '配置',
      [ContextType.COMMIT]: '提交记录'
    };
    
    return descriptions[type] || '未知类型';
  }

  private groupRequestsByType(
    requests: Array<{
      content: string;
      type: ContextType;
      sessionId: string;
      metadata?: Record<string, any>;
    }>
  ): Map<string, typeof requests> {
    const grouped = new Map<string, typeof requests>();
    
    for (const request of requests) {
      const typeKey = request.type.toString();
      if (!grouped.has(typeKey)) {
        grouped.set(typeKey, []);
      }
      grouped.get(typeKey)!.push(request);
    }
    
    return grouped;
  }
}

interface UserPreferences {
  autoConfirmThreshold: number;        // 自动确认阈值
  askConfirmThreshold: number;         // 询问确认阈值
  preferredConfirmationStyle: 'concise' | 'detailed'; // 确认提示风格
  autoConfirmTypes: string[];          // 自动确认的内容类型
  neverConfirmTypes: string[];         // 从不确认的内容类型
  timeoutDuration: number;             // 确认超时时间（毫秒）
}

// 导出类型供其他模块使用
export type { UserPreferences };
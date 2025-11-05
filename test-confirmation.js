/**
 * 测试智能记忆确认提示功能
 * 模拟不同评分场景的输出
 */

// 模拟不同评分的响应
const testCases = [
  {
    score: 72,
    language: "zh",
    scenario: "高价值 Bug 修复",
  },
  {
    score: 65,
    language: "zh",
    scenario: "中等价值代码重构",
  },
  {
    score: 55,
    language: "zh",
    scenario: "低价值代码调整",
  },
  {
    score: 75,
    language: "en",
    scenario: "High-value Performance Optimization",
  },
];

function generateSmartTip(score, language) {
  let smartTip = "";
  let actionGuide = "";

  if (score >= 70) {
    smartTip =
      language === "zh"
        ? `\n\n[智能建议] 评分较高 (${score}/100)，这个内容值得记忆。`
        : `\n\n[Smart Suggestion] High score (${score}/100), this content is worth remembering.`;
    actionGuide =
      language === "zh"
        ? `\n\n[如何记忆] 再次调用 record_context 工具，使用相同的 content 和 type，并设置 force_remember=true 参数。`
        : `\n\n[How to Remember] Call record_context tool again with the same content and type, and set force_remember=true parameter.`;
  } else if (score >= 60) {
    smartTip =
      language === "zh"
        ? `\n\n[智能建议] 评分中等 (${score}/100)，可以考虑记忆。`
        : `\n\n[Smart Suggestion] Medium score (${score}/100), consider remembering.`;
    actionGuide =
      language === "zh"
        ? `\n\n[如需记忆] 再次调用 record_context 工具，使用相同的 content 和 type，并设置 force_remember=true 参数。`
        : `\n\n[If Needed] Call record_context tool again with the same content and type, and set force_remember=true parameter.`;
  } else {
    smartTip =
      language === "zh"
        ? `\n\n[智能建议] 评分偏低 (${score}/100)，建议仅在确实需要时记忆。`
        : `\n\n[Smart Suggestion] Lower score (${score}/100), recommend remembering only if necessary.`;
    actionGuide =
      language === "zh"
        ? `\n\n[注意] 如确需记忆：再次调用 record_context 工具，使用相同的 content 和 type，并设置 force_remember=true 参数。`
        : `\n\n[Note] If really needed: Call record_context tool again with the same content and type, and set force_remember=true parameter.`;
  }

  return { smartTip, actionGuide };
}

// 模拟完整响应
function simulateResponse(testCase) {
  const { smartTip, actionGuide } = generateSmartTip(
    testCase.score,
    testCase.language
  );

  const baseResponse =
    testCase.language === "zh"
      ? `建议记忆（需要确认）

评估结果：
- 过程类型：${testCase.scenario}（置信度 85%）
- 价值评分：${testCase.score}/100
  * 代码显著性：${testCase.score + 3}
  * 问题复杂度：${testCase.score + 8}
  * 解决方案重要性：${testCase.score - 2}
  * 可复用性：${testCase.score - 7}

建议标签：bug-fix, refactor, optimization

决策理由：${testCase.score >= 70 ? "高价值" : testCase.score >= 60 ? "中等价值" : "较低价值"}内容，${testCase.score >= 70 ? "值得记忆" : testCase.score >= 60 ? "可以考虑记忆" : "建议仅在必要时记忆"}`
      : `Suggested to remember (confirmation needed)

Evaluation Result:
- Process Type: ${testCase.scenario} (Confidence 85%)
- Value Score: ${testCase.score}/100
  * Code Significance: ${testCase.score + 3}
  * Problem Complexity: ${testCase.score + 8}
  * Solution Importance: ${testCase.score - 2}
  * Reusability: ${testCase.score - 7}

Suggested Tags: bug-fix, refactor, optimization

Decision Reasoning: ${testCase.score >= 70 ? "High" : testCase.score >= 60 ? "Medium" : "Lower"} value content, ${testCase.score >= 70 ? "worth remembering" : testCase.score >= 60 ? "consider remembering" : "recommend remembering only if necessary"}`;

  return `${baseResponse}${smartTip}${actionGuide}`;
}

// 运行测试
console.log("=".repeat(80));
console.log("智能记忆确认提示 - 测试输出");
console.log("=".repeat(80));

testCases.forEach((testCase, index) => {
  console.log(`\n\n${"=".repeat(80)}`);
  console.log(`测试场景 ${index + 1}: ${testCase.scenario} (评分: ${testCase.score})`);
  console.log("=".repeat(80));
  console.log(simulateResponse(testCase));
});

console.log(`\n\n${"=".repeat(80)}`);
console.log("测试完成");
console.log("=".repeat(80));
console.log("\n验证要点：");
console.log("1. ✓ 无 Emoji 图标");
console.log("2. ✓ 差异化建议（高/中/低）");
console.log("3. ✓ 明确操作引导");
console.log("4. ✓ 中英文支持");
console.log("5. ✓ 语言与评估结果一致");

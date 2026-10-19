// Skill-enabled prompt loader: delegates assembly to the repository helper so
// reference-file boundaries remain identical to other evaluations.
const path = require("path");
const withSkillPrompt = require("../../shared/with-skill-prompt");

module.exports = function ({ vars }) {
  return withSkillPrompt({
    skillId: "chainlink-agent-authority-skill",
    evalDir: path.resolve(__dirname, ".."),
    vars,
  });
};

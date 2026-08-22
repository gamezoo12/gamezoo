/**
 * Avatar registry — points the Champion controller at real GLB assets.
 *
 * IMPORTANT (per user directive 2026-08-22):
 *   - Do NOT use Y-Bot / mannequin as the visible final character.
 *   - Load the user-provided Meshy-rigged GLBs from public artifact URLs.
 *   - Preserve identity: no face/body/material redesign, only presentation
 *     tweaks (shadows, envMap intensity, tone mapping).
 *   - Both genders share the same animation/action API; when a distinct
 *     female model arrives, only the `female.model` URL below changes —
 *     no engine code needs to move.
 */
export const AVATARS = {
  male: {
    // Meshy AI biped hero, rigged
    model: 'https://customer-assets-jt897jd0.emergentagent.net/job_contest-arena-16/artifacts/j2dvwtwk_Meshy_AI_Prize_League_Champion_biped_Character_output.glb',
    // Merged Mixamo-style animations bound to the same skeleton
    animations: 'https://customer-assets-jt897jd0.emergentagent.net/job_contest-arena-16/artifacts/ei0n86qm_Meshy_AI_Prize_League_Champion_biped_Meshy_AI_Meshy_Merged_Animations.glb',
    // Scale factor to bring the model to gameplay height (~1.7 units tall)
    scale: 1.0,
    // World-Y offset so the feet touch the road surface
    groundOffset: 0.0,
  },
  female: {
    // Placeholder: user has uploaded one hero for now — female uses the same
    // GLB. Swap this URL when the female-specific model is provided.
    model: 'https://customer-assets-jt897jd0.emergentagent.net/job_contest-arena-16/artifacts/3c9olexg_Meshy_AI_Prize_League_Champion_biped_Character_output.glb',
    animations: 'https://customer-assets-jt897jd0.emergentagent.net/job_contest-arena-16/artifacts/td1tgyk7_Meshy_AI_Prize_League_Champion_biped_Meshy_AI_Meshy_Merged_Animations.glb',
    scale: 1.0,
    groundOffset: 0.0,
  },
};

/**
 * Human-readable name → substring match against clip names in the merged
 * animations GLB. Meshy exports don't guarantee Mixamo naming, so we match
 * loosely. The FIRST matching clip wins for each action; extras are still
 * available under `mixer.clipAction(clipName)`.
 */
export const ACTION_CLIP_HINTS = {
  idle:    ['idle', 'stand', 'breath'],
  walk:    ['walk'],
  run:     ['run', 'sprint', 'jog'],
  arrive:  ['idle', 'look'],           // fallback → idle
  wave:    ['wave', 'hello', 'hi'],
  victory: ['victory', 'cheer', 'celebrat', 'yes', 'jump', 'win'],
  'championship-victory': ['victory', 'cheer', 'celebrat', 'win', 'dance'],
  defeat:  ['defeat', 'sad', 'no', 'lose', 'death'],
};

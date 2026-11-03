"""Arcade game catalogue: 20 entertaining styles x 5 themes = 100 game types.

Mirrors frontend/src/components/games/arcade/index.jsx (ids arc_<style>_<theme>).
"""

STYLES = [
    ('balloon_pop', 'Balloon Pop', 'arcade', 45), ('catch_fall', 'Catch the Prizes', 'arcade', 60),
    ('higher_lower', 'Higher or Lower', 'luck', 45), ('scratch_reveal', 'Scratch & Reveal', 'luck', 30),
    ('stack_tower', 'Stack the Tower', 'timing', 60), ('dodge_runner', 'Dodge Runner', 'arcade', 60),
    ('spin_match', 'Spin Match', 'timing', 40), ('bubble_burst', 'Bubble Burst', 'puzzle', 60),
    ('quick_quiz', 'Quick Quiz', 'trivia', 45), ('find_odd', 'Find the Odd One', 'observation', 45),
    ('memory_flip', 'Memory Flip', 'memory', 60), ('tap_order', 'Tap in Order', 'reaction', 30),
    ('shell_game', 'Shell Game', 'observation', 60), ('light_chase', 'Light Chase', 'reaction', 45),
    ('count_flash', 'Count Flash', 'memory', 60), ('pair_link', 'Pair Link', 'word', 45),
    ('rhythm_tap', 'Rhythm Tap', 'timing', 45), ('word_guess', 'Word Guess', 'word', 60),
    ('treasure_dig', 'Treasure Dig', 'luck', 45), ('safe_cracker', 'Safe Cracker', 'logic', 90),
]
THEMES = [('fruit', 'Fruit Fiesta'), ('space', 'Cosmic Quest'), ('football', 'Stadium Stars'),
          ('ocean', 'Ocean Treasure'), ('party', 'Party Night')]

ARCADE_GAME_TYPES = [
    {'id': f'arc_{sid}_{tid}', 'label': f'{label} · {tlabel}', 'category': category,
     'target_time_s': target, 'max_attempts': 3, 'family': 'arcade'}
    for sid, label, category, target in STYLES for tid, tlabel in THEMES
]

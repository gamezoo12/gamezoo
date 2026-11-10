import asyncio, os, json
from dotenv import load_dotenv
from emergentintegrations.llm.openai import OpenAITextToSpeech
load_dotenv('/app/backend/.env')
OUT = '/app/frontend/public/santa-voice'
OPENERS = ['Ho Ho Ho', 'Ho ho, hello', 'Jingle jingle', 'Well hello there', 'Ho ho ho, look who is here', 'Merry greetings', 'Sleigh bells ring', 'Twinkle twinkle', 'Hip hip hooray', 'Ho ho, welcome back']
WISHES = ['May your Christmas sparkle brighter than Rudolph\'s nose', 'Wishing you a jolly Christmas full of wins', 'May the New Year bring you golden trophies', 'Here\'s to a cracking New Year of high scores', 'May every level open like a present today', 'My elves say you\'re on the nice list for prizes', 'May your stocking overflow with tokens', 'Wishing you snowflakes of luck in every game', 'May your new year be merry, bright and full of champions\' glory', 'Let\'s make this festive season your best season yet', 'The reindeer are cheering for your next win', 'May your moves be quicker than my sleigh', 'Warm cocoa, cosy wins and a happy New Year to you', 'May the countdown to midnight be a countdown to victory', 'Joy, peace and a sack full of prizes to you']
CLOSERS = ['Let\'s play!', 'Go get that crown!', 'Ho ho, off you go!', 'Your next level awaits!', 'Make it magical!', 'Merry Christmas!', 'Happy New Year!', 'Have a cracking time!', 'Show them your skills!', 'Jingle all the way to the top!']
CHEERS = ['Ho ho ho! Brilliant!', 'Jingle bells, what a win!', 'Ho ho! You\'re on fire!', 'Merry wins to you!', 'Ho ho ho! Onwards!', 'Superb! The elves are dancing too!', 'Happy New Year, champion!']
TRY = ['Ho ho! So close, try again!', 'Don\'t give up, my friend!', 'Ho ho, the next one is yours!', 'Shake it off and go again!']
jobs = [(f'o{i}', f'{t}! Welcome to Prize League!') for i, t in enumerate(OPENERS)] + [(f'w{i}', t + '.') for i, t in enumerate(WISHES)] + [(f'c{i}', t) for i, t in enumerate(CLOSERS)] + [(f'h{i}', t) for i, t in enumerate(CHEERS)] + [(f't{i}', t) for i, t in enumerate(TRY)]
tts = OpenAITextToSpeech(api_key=os.environ['EMERGENT_LLM_KEY'])
sem = asyncio.Semaphore(6)
async def one(k, text):
    p = f'{OUT}/{k}.mp3'
    if os.path.exists(p): return
    async with sem:
        b = await tts.generate_speech(text=text, model='tts-1-hd', voice='onyx', speed=0.93)
    open(p, 'wb').write(b); print(k, len(b), flush=True)
async def main():
    await asyncio.gather(*[one(k, t) for k, t in jobs])
asyncio.run(main())
print('DONE')

import { useEffect, useMemo, useState } from 'react';
import { Bell, RefreshCw, Send, Users, CheckCircle2, Clock3, Ban } from 'lucide-react';
import { adminAPI } from '../../lib/api';

const TEMPLATE_CATEGORIES = {
  "coins": {
    label: "🪙 Coins",
    templates: [
      {
            "name": "🪙 Coins 01",
            "message": "Coins added to your wallet!"
      },
      {
            "name": "🪙 Coins 02",
            "message": "Your coin reward is ready!"
      },
      {
            "name": "🪙 Coins 03",
            "message": "Bonus coins are waiting!"
      },
      {
            "name": "🪙 Coins 04",
            "message": "Your wallet got a coin boost!"
      },
      {
            "name": "🪙 Coins 05",
            "message": "Fresh coins just landed!"
      },
      {
            "name": "🪙 Coins 06",
            "message": "Coins unlocked for you!"
      },
      {
            "name": "🪙 Coins 07",
            "message": "A coin bonus is ready!"
      },
      {
            "name": "🪙 Coins 08",
            "message": "More coins, more chances!"
      },
      {
            "name": "🪙 Coins 09",
            "message": "Your coins have arrived!"
      },
      {
            "name": "🪙 Coins 10",
            "message": "Coin reward unlocked now!"
      },
      {
            "name": "🪙 Coins 11",
            "message": "Wallet coins updated!"
      },
      {
            "name": "🪙 Coins 12",
            "message": "Extra coins are available!"
      },
      {
            "name": "🪙 Coins 13",
            "message": "A shiny coin reward awaits!"
      },
      {
            "name": "🪙 Coins 14",
            "message": "Coins credited successfully!"
      },
      {
            "name": "🪙 Coins 15",
            "message": "Your coin balance increased!"
      },
      {
            "name": "🪙 Coins 16",
            "message": "New coins are ready to use!"
      },
      {
            "name": "🪙 Coins 17",
            "message": "Coin drop just arrived!"
      },
      {
            "name": "🪙 Coins 18",
            "message": "Lucky coins added today!"
      },
      {
            "name": "🪙 Coins 19",
            "message": "Your bonus coins are live!"
      },
      {
            "name": "🪙 Coins 20",
            "message": "Coins waiting in your wallet!"
      },
      {
            "name": "🪙 Coins 21",
            "message": "Grab your coin reward now!"
      },
      {
            "name": "🪙 Coins 22",
            "message": "Your coin stash just grew!"
      },
      {
            "name": "🪙 Coins 23",
            "message": "Fresh coin credit added!"
      },
      {
            "name": "🪙 Coins 24",
            "message": "Coin bonus activated!"
      },
      {
            "name": "🪙 Coins 25",
            "message": "More coins added for you!"
      },
      {
            "name": "🪙 Coins 26",
            "message": "Your coin reward landed!"
      },
      {
            "name": "🪙 Coins 27",
            "message": "Wallet boost: coins added!"
      },
      {
            "name": "🪙 Coins 28",
            "message": "Coin credit is now available!"
      },
      {
            "name": "🪙 Coins 29",
            "message": "Your coins are ready!"
      },
      {
            "name": "🪙 Coins 30",
            "message": "Bonus coin drop is live!"
      },
      {
            "name": "🪙 Coins 31",
            "message": "New coin reward unlocked!"
      },
      {
            "name": "🪙 Coins 32",
            "message": "Your wallet has more coins!"
      },
      {
            "name": "🪙 Coins 33",
            "message": "Coins credited—check now!"
      },
      {
            "name": "🪙 Coins 34",
            "message": "A coin surprise is waiting!"
      },
      {
            "name": "🪙 Coins 35",
            "message": "Your coin balance got boosted!"
      },
      {
            "name": "🪙 Coins 36",
            "message": "Extra coins just dropped!"
      },
      {
            "name": "🪙 Coins 37",
            "message": "Coin reward added today!"
      },
      {
            "name": "🪙 Coins 38",
            "message": "Your wallet received coins!"
      },
      {
            "name": "🪙 Coins 39",
            "message": "More coins are now yours!"
      },
      {
            "name": "🪙 Coins 40",
            "message": "Coins unlocked—enjoy!"
      },
      {
            "name": "🪙 Coins 41",
            "message": "Your latest coins arrived!"
      },
      {
            "name": "🪙 Coins 42",
            "message": "Coin bonus added to wallet!"
      },
      {
            "name": "🪙 Coins 43",
            "message": "New coins, new chances!"
      },
      {
            "name": "🪙 Coins 44",
            "message": "Your coin credit is ready!"
      },
      {
            "name": "🪙 Coins 45",
            "message": "Coins have landed safely!"
      },
      {
            "name": "🪙 Coins 46",
            "message": "Wallet reward: coins added!"
      },
      {
            "name": "🪙 Coins 47",
            "message": "Your coin bonus is active!"
      },
      {
            "name": "🪙 Coins 48",
            "message": "A fresh coin drop awaits!"
      },
      {
            "name": "🪙 Coins 49",
            "message": "Coin balance updated now!"
      },
      {
            "name": "🪙 Coins 50",
            "message": "Enjoy your new coins!"
      }
]
  },
  "tokens": {
    label: "🎟️ Tokens",
    templates: [
      {
            "name": "🎟️ Tokens 01",
            "message": "New tokens are ready!"
      },
      {
            "name": "🎟️ Tokens 02",
            "message": "Free tokens added for you!"
      },
      {
            "name": "🎟️ Tokens 03",
            "message": "Your token reward arrived!"
      },
      {
            "name": "🎟️ Tokens 04",
            "message": "Bonus token unlocked!"
      },
      {
            "name": "🎟️ Tokens 05",
            "message": "Token retry is ready!"
      },
      {
            "name": "🎟️ Tokens 06",
            "message": "Fresh tokens just landed!"
      },
      {
            "name": "🎟️ Tokens 07",
            "message": "Your tokens are waiting!"
      },
      {
            "name": "🎟️ Tokens 08",
            "message": "Token credit added now!"
      },
      {
            "name": "🎟️ Tokens 09",
            "message": "Extra tokens unlocked!"
      },
      {
            "name": "🎟️ Tokens 10",
            "message": "Your token balance grew!"
      },
      {
            "name": "🎟️ Tokens 11",
            "message": "Tokens ready for your game!"
      },
      {
            "name": "🎟️ Tokens 12",
            "message": "A free token is waiting!"
      },
      {
            "name": "🎟️ Tokens 13",
            "message": "Bonus tokens are live!"
      },
      {
            "name": "🎟️ Tokens 14",
            "message": "New token credit available!"
      },
      {
            "name": "🎟️ Tokens 15",
            "message": "Your retry token is ready!"
      },
      {
            "name": "🎟️ Tokens 16",
            "message": "Tokens added successfully!"
      },
      {
            "name": "🎟️ Tokens 17",
            "message": "More tokens, more plays!"
      },
      {
            "name": "🎟️ Tokens 18",
            "message": "Your token bonus landed!"
      },
      {
            "name": "🎟️ Tokens 19",
            "message": "Token reward unlocked now!"
      },
      {
            "name": "🎟️ Tokens 20",
            "message": "Free token drop is live!"
      },
      {
            "name": "🎟️ Tokens 21",
            "message": "Your tokens have arrived!"
      },
      {
            "name": "🎟️ Tokens 22",
            "message": "Extra token ready to use!"
      },
      {
            "name": "🎟️ Tokens 23",
            "message": "Token wallet updated!"
      },
      {
            "name": "🎟️ Tokens 24",
            "message": "A token surprise awaits!"
      },
      {
            "name": "🎟️ Tokens 25",
            "message": "New tokens added today!"
      },
      {
            "name": "🎟️ Tokens 26",
            "message": "Your token stash just grew!"
      },
      {
            "name": "🎟️ Tokens 27",
            "message": "Token credit is now ready!"
      },
      {
            "name": "🎟️ Tokens 28",
            "message": "Bonus retry token unlocked!"
      },
      {
            "name": "🎟️ Tokens 29",
            "message": "Fresh token reward added!"
      },
      {
            "name": "🎟️ Tokens 30",
            "message": "Tokens waiting for action!"
      },
      {
            "name": "🎟️ Tokens 31",
            "message": "Your free tokens are live!"
      },
      {
            "name": "🎟️ Tokens 32",
            "message": "Token bonus activated!"
      },
      {
            "name": "🎟️ Tokens 33",
            "message": "More play tokens added!"
      },
      {
            "name": "🎟️ Tokens 34",
            "message": "Your latest token arrived!"
      },
      {
            "name": "🎟️ Tokens 35",
            "message": "Token reward ready now!"
      },
      {
            "name": "🎟️ Tokens 36",
            "message": "Extra tokens just dropped!"
      },
      {
            "name": "🎟️ Tokens 37",
            "message": "Your token credit landed!"
      },
      {
            "name": "🎟️ Tokens 38",
            "message": "Free play token available!"
      },
      {
            "name": "🎟️ Tokens 39",
            "message": "Token balance updated now!"
      },
      {
            "name": "🎟️ Tokens 40",
            "message": "A bonus token awaits!"
      },
      {
            "name": "🎟️ Tokens 41",
            "message": "Tokens unlocked—play now!"
      },
      {
            "name": "🎟️ Tokens 42",
            "message": "Your token reward is live!"
      },
      {
            "name": "🎟️ Tokens 43",
            "message": "New retry token available!"
      },
      {
            "name": "🎟️ Tokens 44",
            "message": "Fresh tokens for your game!"
      },
      {
            "name": "🎟️ Tokens 45",
            "message": "Your tokens are ready now!"
      },
      {
            "name": "🎟️ Tokens 46",
            "message": "Token drop: check account!"
      },
      {
            "name": "🎟️ Tokens 47",
            "message": "More tokens added for you!"
      },
      {
            "name": "🎟️ Tokens 48",
            "message": "Your bonus token is ready!"
      },
      {
            "name": "🎟️ Tokens 49",
            "message": "Token credit added today!"
      },
      {
            "name": "🎟️ Tokens 50",
            "message": "Enjoy your new tokens!"
      }
]
  },
  "prizes": {
    label: "🏆 Prizes",
    templates: [
      {
            "name": "🏆 Prizes 01",
            "message": "A prize is waiting for you!"
      },
      {
            "name": "🏆 Prizes 02",
            "message": "Your prize is ready!"
      },
      {
            "name": "🏆 Prizes 03",
            "message": "Prize reward unlocked!"
      },
      {
            "name": "🏆 Prizes 04",
            "message": "A new prize awaits you!"
      },
      {
            "name": "🏆 Prizes 05",
            "message": "Your reward is ready!"
      },
      {
            "name": "🏆 Prizes 06",
            "message": "Prize alert—check it now!"
      },
      {
            "name": "🏆 Prizes 07",
            "message": "Your prize just landed!"
      },
      {
            "name": "🏆 Prizes 08",
            "message": "A special prize is waiting!"
      },
      {
            "name": "🏆 Prizes 09",
            "message": "Prize unlocked—great job!"
      },
      {
            "name": "🏆 Prizes 10",
            "message": "Your reward has arrived!"
      },
      {
            "name": "🏆 Prizes 11",
            "message": "New prize ready to view!"
      },
      {
            "name": "🏆 Prizes 12",
            "message": "Prize time—check account!"
      },
      {
            "name": "🏆 Prizes 13",
            "message": "Your prize is now available!"
      },
      {
            "name": "🏆 Prizes 14",
            "message": "A reward is waiting inside!"
      },
      {
            "name": "🏆 Prizes 15",
            "message": "Prize credit is ready!"
      },
      {
            "name": "🏆 Prizes 16",
            "message": "Your latest prize arrived!"
      },
      {
            "name": "🏆 Prizes 17",
            "message": "Big prize alert for you!"
      },
      {
            "name": "🏆 Prizes 18",
            "message": "Prize unlocked today!"
      },
      {
            "name": "🏆 Prizes 19",
            "message": "Your reward just dropped!"
      },
      {
            "name": "🏆 Prizes 20",
            "message": "A prize surprise awaits!"
      },
      {
            "name": "🏆 Prizes 21",
            "message": "Check your new prize now!"
      },
      {
            "name": "🏆 Prizes 22",
            "message": "Your prize has been added!"
      },
      {
            "name": "🏆 Prizes 23",
            "message": "Prize reward ready now!"
      },
      {
            "name": "🏆 Prizes 24",
            "message": "A fresh prize is waiting!"
      },
      {
            "name": "🏆 Prizes 25",
            "message": "Your prize moment is here!"
      },
      {
            "name": "🏆 Prizes 26",
            "message": "Reward unlocked—check now!"
      },
      {
            "name": "🏆 Prizes 27",
            "message": "Prize available in account!"
      },
      {
            "name": "🏆 Prizes 28",
            "message": "Your prize is live now!"
      },
      {
            "name": "🏆 Prizes 29",
            "message": "A winning reward awaits!"
      },
      {
            "name": "🏆 Prizes 30",
            "message": "Prize drop just arrived!"
      },
      {
            "name": "🏆 Prizes 31",
            "message": "Your reward is now ready!"
      },
      {
            "name": "🏆 Prizes 32",
            "message": "New prize unlocked for you!"
      },
      {
            "name": "🏆 Prizes 33",
            "message": "Prize alert—open account!"
      },
      {
            "name": "🏆 Prizes 34",
            "message": "Your prize has arrived!"
      },
      {
            "name": "🏆 Prizes 35",
            "message": "A special reward is ready!"
      },
      {
            "name": "🏆 Prizes 36",
            "message": "Prize unlocked—view now!"
      },
      {
            "name": "🏆 Prizes 37",
            "message": "Your latest reward landed!"
      },
      {
            "name": "🏆 Prizes 38",
            "message": "Prize ready—don't miss it!"
      },
      {
            "name": "🏆 Prizes 39",
            "message": "A new reward awaits you!"
      },
      {
            "name": "🏆 Prizes 40",
            "message": "Your prize credit arrived!"
      },
      {
            "name": "🏆 Prizes 41",
            "message": "Prize reward added today!"
      },
      {
            "name": "🏆 Prizes 42",
            "message": "Your prize is waiting now!"
      },
      {
            "name": "🏆 Prizes 43",
            "message": "New reward ready to claim!"
      },
      {
            "name": "🏆 Prizes 44",
            "message": "Prize alert—great news!"
      },
      {
            "name": "🏆 Prizes 45",
            "message": "Your reward has been added!"
      },
      {
            "name": "🏆 Prizes 46",
            "message": "Prize unlocked—enjoy it!"
      },
      {
            "name": "🏆 Prizes 47",
            "message": "Your winning prize is ready!"
      },
      {
            "name": "🏆 Prizes 48",
            "message": "Reward drop just landed!"
      },
      {
            "name": "🏆 Prizes 49",
            "message": "Check your prize today!"
      },
      {
            "name": "🏆 Prizes 50",
            "message": "A prize is ready for you!"
      }
]
  },
  "championship": {
    label: "👑 Championship",
    templates: [
      {
            "name": "👑 Championship 01",
            "message": "Championship is OPEN now!"
      },
      {
            "name": "👑 Championship 02",
            "message": "The Championship is LIVE!"
      },
      {
            "name": "👑 Championship 03",
            "message": "Champion level is ready!"
      },
      {
            "name": "👑 Championship 04",
            "message": "Your Championship awaits!"
      },
      {
            "name": "👑 Championship 05",
            "message": "Enter the Championship now!"
      },
      {
            "name": "👑 Championship 06",
            "message": "Championship action is live!"
      },
      {
            "name": "👑 Championship 07",
            "message": "Time to chase the crown!"
      },
      {
            "name": "👑 Championship 08",
            "message": "The race for #1 is live!"
      },
      {
            "name": "👑 Championship 09",
            "message": "Champion mode activated!"
      },
      {
            "name": "👑 Championship 10",
            "message": "Your title chase starts now!"
      },
      {
            "name": "👑 Championship 11",
            "message": "Championship doors are open!"
      },
      {
            "name": "👑 Championship 12",
            "message": "Compete for the crown now!"
      },
      {
            "name": "👑 Championship 13",
            "message": "The Champion stage is live!"
      },
      {
            "name": "👑 Championship 14",
            "message": "Ready for Championship glory?"
      },
      {
            "name": "👑 Championship 15",
            "message": "Start your Championship run!"
      },
      {
            "name": "👑 Championship 16",
            "message": "Championship battle begins!"
      },
      {
            "name": "👑 Championship 17",
            "message": "Fight for the top spot!"
      },
      {
            "name": "👑 Championship 18",
            "message": "Your Champion journey starts!"
      },
      {
            "name": "👑 Championship 19",
            "message": "The crown is up for grabs!"
      },
      {
            "name": "👑 Championship 20",
            "message": "Championship challenge live!"
      },
      {
            "name": "👑 Championship 21",
            "message": "Enter and chase #1 now!"
      },
      {
            "name": "👑 Championship 22",
            "message": "Champion level unlocked!"
      },
      {
            "name": "👑 Championship 23",
            "message": "The Championship awaits you!"
      },
      {
            "name": "👑 Championship 24",
            "message": "Take your shot at the crown!"
      },
      {
            "name": "👑 Championship 25",
            "message": "Championship time—play now!"
      },
      {
            "name": "👑 Championship 26",
            "message": "Your Champion run is ready!"
      },
      {
            "name": "👑 Championship 27",
            "message": "Climb toward the crown now!"
      },
      {
            "name": "👑 Championship 28",
            "message": "Championship entry is open!"
      },
      {
            "name": "👑 Championship 29",
            "message": "The race to victory begins!"
      },
      {
            "name": "👑 Championship 30",
            "message": "Champion challenge unlocked!"
      },
      {
            "name": "👑 Championship 31",
            "message": "Compete for glory today!"
      },
      {
            "name": "👑 Championship 32",
            "message": "Your Championship is ready!"
      },
      {
            "name": "👑 Championship 33",
            "message": "Take on the Champion level!"
      },
      {
            "name": "👑 Championship 34",
            "message": "Championship play is active!"
      },
      {
            "name": "👑 Championship 35",
            "message": "The crown chase is on!"
      },
      {
            "name": "👑 Championship 36",
            "message": "Ready to become Champion?"
      },
      {
            "name": "👑 Championship 37",
            "message": "Your Championship starts now!"
      },
      {
            "name": "👑 Championship 38",
            "message": "Champion action is waiting!"
      },
      {
            "name": "👑 Championship 39",
            "message": "Enter the title race now!"
      },
      {
            "name": "👑 Championship 40",
            "message": "Championship glory awaits!"
      },
      {
            "name": "👑 Championship 41",
            "message": "Challenge the leaders now!"
      },
      {
            "name": "👑 Championship 42",
            "message": "Your Champion attempt awaits!"
      },
      {
            "name": "👑 Championship 43",
            "message": "The top spot is calling!"
      },
      {
            "name": "👑 Championship 44",
            "message": "Championship mode is live!"
      },
      {
            "name": "👑 Championship 45",
            "message": "Play for the crown today!"
      },
      {
            "name": "👑 Championship 46",
            "message": "Your road to #1 starts now!"
      },
      {
            "name": "👑 Championship 47",
            "message": "Champion stage now open!"
      },
      {
            "name": "👑 Championship 48",
            "message": "Enter the Championship race!"
      },
      {
            "name": "👑 Championship 49",
            "message": "Make your Champion move!"
      },
      {
            "name": "👑 Championship 50",
            "message": "The Championship is yours!"
      }
]
  },
  "closing": {
    label: "⏰ Closing Alerts",
    templates: [
      {
            "name": "⏰ Closing Alerts 01",
            "message": "Championship closing soon!"
      },
      {
            "name": "⏰ Closing Alerts 02",
            "message": "Final hour—play now!"
      },
      {
            "name": "⏰ Closing Alerts 03",
            "message": "Only 30 minutes remaining!"
      },
      {
            "name": "⏰ Closing Alerts 04",
            "message": "10 minutes left—play now!"
      },
      {
            "name": "⏰ Closing Alerts 05",
            "message": "Last chance before closing!"
      },
      {
            "name": "⏰ Closing Alerts 06",
            "message": "Time is running out!"
      },
      {
            "name": "⏰ Closing Alerts 07",
            "message": "Closing soon—don't miss out!"
      },
      {
            "name": "⏰ Closing Alerts 08",
            "message": "Final call for your attempts!"
      },
      {
            "name": "⏰ Closing Alerts 09",
            "message": "The clock is ticking!"
      },
      {
            "name": "⏰ Closing Alerts 10",
            "message": "Play before time runs out!"
      },
      {
            "name": "⏰ Closing Alerts 11",
            "message": "Your final chance is here!"
      },
      {
            "name": "⏰ Closing Alerts 12",
            "message": "Closing alert—act now!"
      },
      {
            "name": "⏰ Closing Alerts 13",
            "message": "Almost over—play today!"
      },
      {
            "name": "⏰ Closing Alerts 14",
            "message": "Final minutes are coming!"
      },
      {
            "name": "⏰ Closing Alerts 15",
            "message": "Use your attempts before close!"
      },
      {
            "name": "⏰ Closing Alerts 16",
            "message": "Championship ends soon!"
      },
      {
            "name": "⏰ Closing Alerts 17",
            "message": "Don't leave attempts unused!"
      },
      {
            "name": "⏰ Closing Alerts 18",
            "message": "Final stretch—keep playing!"
      },
      {
            "name": "⏰ Closing Alerts 19",
            "message": "Time is nearly up!"
      },
      {
            "name": "⏰ Closing Alerts 20",
            "message": "Last call to compete!"
      },
      {
            "name": "⏰ Closing Alerts 21",
            "message": "Closing time is approaching!"
      },
      {
            "name": "⏰ Closing Alerts 22",
            "message": "Finish your attempts now!"
      },
      {
            "name": "⏰ Closing Alerts 23",
            "message": "Your window is closing!"
      },
      {
            "name": "⏰ Closing Alerts 24",
            "message": "Beat the clock—play now!"
      },
      {
            "name": "⏰ Closing Alerts 25",
            "message": "Final chance to climb ranks!"
      },
      {
            "name": "⏰ Closing Alerts 26",
            "message": "Closing soon—make it count!"
      },
      {
            "name": "⏰ Closing Alerts 27",
            "message": "Use your final attempts!"
      },
      {
            "name": "⏰ Closing Alerts 28",
            "message": "The countdown is on!"
      },
      {
            "name": "⏰ Closing Alerts 29",
            "message": "Not long left—play now!"
      },
      {
            "name": "⏰ Closing Alerts 30",
            "message": "Final push before closing!"
      },
      {
            "name": "⏰ Closing Alerts 31",
            "message": "Your last plays await!"
      },
      {
            "name": "⏰ Closing Alerts 32",
            "message": "Time's almost gone!"
      },
      {
            "name": "⏰ Closing Alerts 33",
            "message": "Championship final call!"
      },
      {
            "name": "⏰ Closing Alerts 34",
            "message": "Don't miss the closing bell!"
      },
      {
            "name": "⏰ Closing Alerts 35",
            "message": "Last moments to compete!"
      },
      {
            "name": "⏰ Closing Alerts 36",
            "message": "Final countdown—play now!"
      },
      {
            "name": "⏰ Closing Alerts 37",
            "message": "Closing soon—finish strong!"
      },
      {
            "name": "⏰ Closing Alerts 38",
            "message": "Your remaining time is short!"
      },
      {
            "name": "⏰ Closing Alerts 39",
            "message": "Last chance to improve rank!"
      },
      {
            "name": "⏰ Closing Alerts 40",
            "message": "Final attempts—use them now!"
      },
      {
            "name": "⏰ Closing Alerts 41",
            "message": "The finish line is near!"
      },
      {
            "name": "⏰ Closing Alerts 42",
            "message": "Closing alert—move fast!"
      },
      {
            "name": "⏰ Closing Alerts 43",
            "message": "Time left is running low!"
      },
      {
            "name": "⏰ Closing Alerts 44",
            "message": "Make your final play now!"
      },
      {
            "name": "⏰ Closing Alerts 45",
            "message": "Final opportunity is here!"
      },
      {
            "name": "⏰ Closing Alerts 46",
            "message": "Ends soon—don't wait!"
      },
      {
            "name": "⏰ Closing Alerts 47",
            "message": "Clock's ticking—jump in!"
      },
      {
            "name": "⏰ Closing Alerts 48",
            "message": "Last call for Championship!"
      },
      {
            "name": "⏰ Closing Alerts 49",
            "message": "Finish before the timer ends!"
      },
      {
            "name": "⏰ Closing Alerts 50",
            "message": "Final chance—go for it!"
      }
]
  },
  "attempts": {
    label: "🎮 Attempts",
    templates: [
      {
            "name": "🎮 Attempts 01",
            "message": "Your free attempts are ready!"
      },
      {
            "name": "🎮 Attempts 02",
            "message": "3 free attempts are waiting!"
      },
      {
            "name": "🎮 Attempts 03",
            "message": "You still have attempts left!"
      },
      {
            "name": "🎮 Attempts 04",
            "message": "Ready for another attempt?"
      },
      {
            "name": "🎮 Attempts 05",
            "message": "Retry unlocked—play again!"
      },
      {
            "name": "🎮 Attempts 06",
            "message": "Your next attempt is ready!"
      },
      {
            "name": "🎮 Attempts 07",
            "message": "Free plays are waiting!"
      },
      {
            "name": "🎮 Attempts 08",
            "message": "Use your attempts today!"
      },
      {
            "name": "🎮 Attempts 09",
            "message": "Another attempt awaits!"
      },
      {
            "name": "🎮 Attempts 10",
            "message": "Your game attempts are live!"
      },
      {
            "name": "🎮 Attempts 11",
            "message": "Three chances are ready!"
      },
      {
            "name": "🎮 Attempts 12",
            "message": "Free attempt available now!"
      },
      {
            "name": "🎮 Attempts 13",
            "message": "Your retries are waiting!"
      },
      {
            "name": "🎮 Attempts 14",
            "message": "Play your next attempt now!"
      },
      {
            "name": "🎮 Attempts 15",
            "message": "Attempts refreshed—go play!"
      },
      {
            "name": "🎮 Attempts 16",
            "message": "Your free plays are ready!"
      },
      {
            "name": "🎮 Attempts 17",
            "message": "Another chance is waiting!"
      },
      {
            "name": "🎮 Attempts 18",
            "message": "Use your remaining attempts!"
      },
      {
            "name": "🎮 Attempts 19",
            "message": "Your attempt counter is ready!"
      },
      {
            "name": "🎮 Attempts 20",
            "message": "Three attempts—make them count!"
      },
      {
            "name": "🎮 Attempts 21",
            "message": "Retry ready when you are!"
      },
      {
            "name": "🎮 Attempts 22",
            "message": "Your next play is unlocked!"
      },
      {
            "name": "🎮 Attempts 23",
            "message": "Attempts available—jump in!"
      },
      {
            "name": "🎮 Attempts 24",
            "message": "A fresh attempt awaits!"
      },
      {
            "name": "🎮 Attempts 25",
            "message": "Free retry ready to play!"
      },
      {
            "name": "🎮 Attempts 26",
            "message": "Your attempts are unlocked!"
      },
      {
            "name": "🎮 Attempts 27",
            "message": "Play again—attempt ready!"
      },
      {
            "name": "🎮 Attempts 28",
            "message": "More chances are waiting!"
      },
      {
            "name": "🎮 Attempts 29",
            "message": "Your free chance is live!"
      },
      {
            "name": "🎮 Attempts 30",
            "message": "Attempts ready for action!"
      },
      {
            "name": "🎮 Attempts 31",
            "message": "Take another shot now!"
      },
      {
            "name": "🎮 Attempts 32",
            "message": "Your retry chance is ready!"
      },
      {
            "name": "🎮 Attempts 33",
            "message": "Free attempts—start now!"
      },
      {
            "name": "🎮 Attempts 34",
            "message": "Another play is available!"
      },
      {
            "name": "🎮 Attempts 35",
            "message": "Your next chance awaits!"
      },
      {
            "name": "🎮 Attempts 36",
            "message": "Attempts left—keep going!"
      },
      {
            "name": "🎮 Attempts 37",
            "message": "Use your free plays now!"
      },
      {
            "name": "🎮 Attempts 38",
            "message": "A new attempt is ready!"
      },
      {
            "name": "🎮 Attempts 39",
            "message": "Your game chance is live!"
      },
      {
            "name": "🎮 Attempts 40",
            "message": "Retry available—jump back in!"
      },
      {
            "name": "🎮 Attempts 41",
            "message": "Three free plays await!"
      },
      {
            "name": "🎮 Attempts 42",
            "message": "Your attempt is ready now!"
      },
      {
            "name": "🎮 Attempts 43",
            "message": "Keep playing—tries remain!"
      },
      {
            "name": "🎮 Attempts 44",
            "message": "Free retry unlocked now!"
      },
      {
            "name": "🎮 Attempts 45",
            "message": "Your remaining plays await!"
      },
      {
            "name": "🎮 Attempts 46",
            "message": "Another chance—go for it!"
      },
      {
            "name": "🎮 Attempts 47",
            "message": "Attempts available today!"
      },
      {
            "name": "🎮 Attempts 48",
            "message": "Your next try is waiting!"
      },
      {
            "name": "🎮 Attempts 49",
            "message": "Play again with a free try!"
      },
      {
            "name": "🎮 Attempts 50",
            "message": "Ready, set, attempt!"
      }
]
  },
  "leaderboard": {
    label: "📈 Leaderboard",
    templates: [
      {
            "name": "📈 Leaderboard 01",
            "message": "Check your leaderboard rank!"
      },
      {
            "name": "📈 Leaderboard 02",
            "message": "You're climbing the ranks!"
      },
      {
            "name": "📈 Leaderboard 03",
            "message": "Can you take the top spot?"
      },
      {
            "name": "📈 Leaderboard 04",
            "message": "Leaderboard is live now!"
      },
      {
            "name": "📈 Leaderboard 05",
            "message": "Climb higher—play again!"
      },
      {
            "name": "📈 Leaderboard 06",
            "message": "Your latest rank is ready!"
      },
      {
            "name": "📈 Leaderboard 07",
            "message": "See where you stand now!"
      },
      {
            "name": "📈 Leaderboard 08",
            "message": "The top spot is waiting!"
      },
      {
            "name": "📈 Leaderboard 09",
            "message": "Your rank just updated!"
      },
      {
            "name": "📈 Leaderboard 10",
            "message": "Chase #1 on the leaderboard!"
      },
      {
            "name": "📈 Leaderboard 11",
            "message": "Leaderboard update is live!"
      },
      {
            "name": "📈 Leaderboard 12",
            "message": "Move up the rankings now!"
      },
      {
            "name": "📈 Leaderboard 13",
            "message": "Check your new position!"
      },
      {
            "name": "📈 Leaderboard 14",
            "message": "Your leaderboard awaits!"
      },
      {
            "name": "📈 Leaderboard 15",
            "message": "Can you climb even higher?"
      },
      {
            "name": "📈 Leaderboard 16",
            "message": "See your current rank now!"
      },
      {
            "name": "📈 Leaderboard 17",
            "message": "The race for #1 continues!"
      },
      {
            "name": "📈 Leaderboard 18",
            "message": "Your position has changed!"
      },
      {
            "name": "📈 Leaderboard 19",
            "message": "Climb the board today!"
      },
      {
            "name": "📈 Leaderboard 20",
            "message": "Leaderboard action is live!"
      },
      {
            "name": "📈 Leaderboard 21",
            "message": "Check who's leading now!"
      },
      {
            "name": "📈 Leaderboard 22",
            "message": "Push for a higher rank!"
      },
      {
            "name": "📈 Leaderboard 23",
            "message": "Your rank is waiting inside!"
      },
      {
            "name": "📈 Leaderboard 24",
            "message": "Make your move up the board!"
      },
      {
            "name": "📈 Leaderboard 25",
            "message": "Top ranks are within reach!"
      },
      {
            "name": "📈 Leaderboard 26",
            "message": "Leaderboard refreshed now!"
      },
      {
            "name": "📈 Leaderboard 27",
            "message": "See your latest standing!"
      },
      {
            "name": "📈 Leaderboard 28",
            "message": "Your next rank is close!"
      },
      {
            "name": "📈 Leaderboard 29",
            "message": "Fight for a top position!"
      },
      {
            "name": "📈 Leaderboard 30",
            "message": "Climb toward first place!"
      },
      {
            "name": "📈 Leaderboard 31",
            "message": "Your ranking journey continues!"
      },
      {
            "name": "📈 Leaderboard 32",
            "message": "Check the standings now!"
      },
      {
            "name": "📈 Leaderboard 33",
            "message": "A higher rank is waiting!"
      },
      {
            "name": "📈 Leaderboard 34",
            "message": "Leaderboard race is on!"
      },
      {
            "name": "📈 Leaderboard 35",
            "message": "See your position today!"
      },
      {
            "name": "📈 Leaderboard 36",
            "message": "Keep climbing the leaderboard!"
      },
      {
            "name": "📈 Leaderboard 37",
            "message": "Your top spot chase is live!"
      },
      {
            "name": "📈 Leaderboard 38",
            "message": "Rank update—check now!"
      },
      {
            "name": "📈 Leaderboard 39",
            "message": "Push your score higher!"
      },
      {
            "name": "📈 Leaderboard 40",
            "message": "Your leaderboard run awaits!"
      },
      {
            "name": "📈 Leaderboard 41",
            "message": "See if you moved up!"
      },
      {
            "name": "📈 Leaderboard 42",
            "message": "The rankings just updated!"
      },
      {
            "name": "📈 Leaderboard 43",
            "message": "Chase the leaders today!"
      },
      {
            "name": "📈 Leaderboard 44",
            "message": "Your current place is ready!"
      },
      {
            "name": "📈 Leaderboard 45",
            "message": "Rise through the ranks now!"
      },
      {
            "name": "📈 Leaderboard 46",
            "message": "Leaderboard challenge is on!"
      },
      {
            "name": "📈 Leaderboard 47",
            "message": "Check your progress today!"
      },
      {
            "name": "📈 Leaderboard 48",
            "message": "Can you reach the podium?"
      },
      {
            "name": "📈 Leaderboard 49",
            "message": "Your ranking is live now!"
      },
      {
            "name": "📈 Leaderboard 50",
            "message": "Make a move toward #1!"
      }
]
  },
  "promotions": {
    label: "🎁 Promotions",
    templates: [
      {
            "name": "🎁 Promotions 01",
            "message": "A special reward is waiting!"
      },
      {
            "name": "🎁 Promotions 02",
            "message": "Surprise bonus available now!"
      },
      {
            "name": "🎁 Promotions 03",
            "message": "Limited bonus is live!"
      },
      {
            "name": "🎁 Promotions 04",
            "message": "Special offer is live now!"
      },
      {
            "name": "🎁 Promotions 05",
            "message": "Don't miss today's reward!"
      },
      {
            "name": "🎁 Promotions 06",
            "message": "A new promotion just landed!"
      },
      {
            "name": "🎁 Promotions 07",
            "message": "Bonus time—check it now!"
      },
      {
            "name": "🎁 Promotions 08",
            "message": "Your special offer awaits!"
      },
      {
            "name": "🎁 Promotions 09",
            "message": "Limited reward available!"
      },
      {
            "name": "🎁 Promotions 10",
            "message": "Today's bonus is ready!"
      },
      {
            "name": "🎁 Promotions 11",
            "message": "Promotion alert—open now!"
      },
      {
            "name": "🎁 Promotions 12",
            "message": "A fresh offer is waiting!"
      },
      {
            "name": "🎁 Promotions 13",
            "message": "Special bonus unlocked!"
      },
      {
            "name": "🎁 Promotions 14",
            "message": "Your promo reward is live!"
      },
      {
            "name": "🎁 Promotions 15",
            "message": "Limited-time bonus awaits!"
      },
      {
            "name": "🎁 Promotions 16",
            "message": "New offer available today!"
      },
      {
            "name": "🎁 Promotions 17",
            "message": "A surprise reward is live!"
      },
      {
            "name": "🎁 Promotions 18",
            "message": "Promotion now available!"
      },
      {
            "name": "🎁 Promotions 19",
            "message": "Your bonus offer just arrived!"
      },
      {
            "name": "🎁 Promotions 20",
            "message": "Special deal—check it out!"
      },
      {
            "name": "🎁 Promotions 21",
            "message": "Bonus alert for you!"
      },
      {
            "name": "🎁 Promotions 22",
            "message": "Today's promotion is live!"
      },
      {
            "name": "🎁 Promotions 23",
            "message": "A limited reward awaits!"
      },
      {
            "name": "🎁 Promotions 24",
            "message": "Your special bonus is ready!"
      },
      {
            "name": "🎁 Promotions 25",
            "message": "New promo—don't miss it!"
      },
      {
            "name": "🎁 Promotions 26",
            "message": "Reward offer available now!"
      },
      {
            "name": "🎁 Promotions 27",
            "message": "A fresh bonus just dropped!"
      },
      {
            "name": "🎁 Promotions 28",
            "message": "Special promotion unlocked!"
      },
      {
            "name": "🎁 Promotions 29",
            "message": "Your limited offer is ready!"
      },
      {
            "name": "🎁 Promotions 30",
            "message": "Bonus opportunity is live!"
      },
      {
            "name": "🎁 Promotions 31",
            "message": "Check today's special reward!"
      },
      {
            "name": "🎁 Promotions 32",
            "message": "Promotion drop just landed!"
      },
      {
            "name": "🎁 Promotions 33",
            "message": "A new bonus awaits you!"
      },
      {
            "name": "🎁 Promotions 34",
            "message": "Your promo is ready now!"
      },
      {
            "name": "🎁 Promotions 35",
            "message": "Limited offer—open today!"
      },
      {
            "name": "🎁 Promotions 36",
            "message": "Special reward unlocked now!"
      },
      {
            "name": "🎁 Promotions 37",
            "message": "A bonus surprise awaits!"
      },
      {
            "name": "🎁 Promotions 38",
            "message": "Promotion live—check now!"
      },
      {
            "name": "🎁 Promotions 39",
            "message": "Your latest offer arrived!"
      },
      {
            "name": "🎁 Promotions 40",
            "message": "Today's reward is waiting!"
      },
      {
            "name": "🎁 Promotions 41",
            "message": "Bonus deal available now!"
      },
      {
            "name": "🎁 Promotions 42",
            "message": "Special offer—don't wait!"
      },
      {
            "name": "🎁 Promotions 43",
            "message": "A new promo reward is live!"
      },
      {
            "name": "🎁 Promotions 44",
            "message": "Limited bonus—check account!"
      },
      {
            "name": "🎁 Promotions 45",
            "message": "Your promotion just started!"
      },
      {
            "name": "🎁 Promotions 46",
            "message": "Fresh offer available today!"
      },
      {
            "name": "🎁 Promotions 47",
            "message": "Reward promotion is live!"
      },
      {
            "name": "🎁 Promotions 48",
            "message": "Your special deal awaits!"
      },
      {
            "name": "🎁 Promotions 49",
            "message": "Bonus drop—open now!"
      },
      {
            "name": "🎁 Promotions 50",
            "message": "Don't miss this promotion!"
      }
]
  },
  "credits": {
    label: "💷 Credits",
    templates: [
      {
            "name": "💷 Credits 01",
            "message": "Account credit added!"
      },
      {
            "name": "💷 Credits 02",
            "message": "Your reward credit arrived!"
      },
      {
            "name": "💷 Credits 03",
            "message": "Your wallet has been updated!"
      },
      {
            "name": "💷 Credits 04",
            "message": "Bonus credit added now!"
      },
      {
            "name": "💷 Credits 05",
            "message": "Prize credit is in your wallet!"
      },
      {
            "name": "💷 Credits 06",
            "message": "New credit added today!"
      },
      {
            "name": "💷 Credits 07",
            "message": "Your wallet credit is ready!"
      },
      {
            "name": "💷 Credits 08",
            "message": "Credit successfully applied!"
      },
      {
            "name": "💷 Credits 09",
            "message": "Your balance just increased!"
      },
      {
            "name": "💷 Credits 10",
            "message": "Fresh credit has arrived!"
      },
      {
            "name": "💷 Credits 11",
            "message": "Wallet boost added now!"
      },
      {
            "name": "💷 Credits 12",
            "message": "Your account received credit!"
      },
      {
            "name": "💷 Credits 13",
            "message": "Bonus balance is ready!"
      },
      {
            "name": "💷 Credits 14",
            "message": "Prize funds added to wallet!"
      },
      {
            "name": "💷 Credits 15",
            "message": "Your credit is now available!"
      },
      {
            "name": "💷 Credits 16",
            "message": "Account balance updated!"
      },
      {
            "name": "💷 Credits 17",
            "message": "Reward funds just landed!"
      },
      {
            "name": "💷 Credits 18",
            "message": "Credit added—check wallet!"
      },
      {
            "name": "💷 Credits 19",
            "message": "Your wallet got a boost!"
      },
      {
            "name": "💷 Credits 20",
            "message": "New balance credit arrived!"
      },
      {
            "name": "💷 Credits 21",
            "message": "Your funds are ready now!"
      },
      {
            "name": "💷 Credits 22",
            "message": "Wallet reward has arrived!"
      },
      {
            "name": "💷 Credits 23",
            "message": "Credit update completed!"
      },
      {
            "name": "💷 Credits 24",
            "message": "Your bonus funds are live!"
      },
      {
            "name": "💷 Credits 25",
            "message": "Prize balance added today!"
      },
      {
            "name": "💷 Credits 26",
            "message": "Your account was credited!"
      },
      {
            "name": "💷 Credits 27",
            "message": "Fresh funds added to wallet!"
      },
      {
            "name": "💷 Credits 28",
            "message": "Wallet credit unlocked!"
      },
      {
            "name": "💷 Credits 29",
            "message": "Your reward balance increased!"
      },
      {
            "name": "💷 Credits 30",
            "message": "Credit landed successfully!"
      },
      {
            "name": "💷 Credits 31",
            "message": "New funds are waiting!"
      },
      {
            "name": "💷 Credits 32",
            "message": "Your wallet reward is ready!"
      },
      {
            "name": "💷 Credits 33",
            "message": "Balance boost just arrived!"
      },
      {
            "name": "💷 Credits 34",
            "message": "Account credit is live now!"
      },
      {
            "name": "💷 Credits 35",
            "message": "Your prize funds are ready!"
      },
      {
            "name": "💷 Credits 36",
            "message": "Bonus funds added today!"
      },
      {
            "name": "💷 Credits 37",
            "message": "Wallet updated—check now!"
      },
      {
            "name": "💷 Credits 38",
            "message": "Your credit reward landed!"
      },
      {
            "name": "💷 Credits 39",
            "message": "New balance available now!"
      },
      {
            "name": "💷 Credits 40",
            "message": "Funds added to your account!"
      },
      {
            "name": "💷 Credits 41",
            "message": "Your wallet just increased!"
      },
      {
            "name": "💷 Credits 42",
            "message": "Reward credit ready to use!"
      },
      {
            "name": "💷 Credits 43",
            "message": "Prize credit added now!"
      },
      {
            "name": "💷 Credits 44",
            "message": "Account funds updated!"
      },
      {
            "name": "💷 Credits 45",
            "message": "Your latest credit arrived!"
      },
      {
            "name": "💷 Credits 46",
            "message": "Bonus balance added!"
      },
      {
            "name": "💷 Credits 47",
            "message": "Wallet funds are ready!"
      },
      {
            "name": "💷 Credits 48",
            "message": "Credit reward unlocked!"
      },
      {
            "name": "💷 Credits 49",
            "message": "Your balance boost is live!"
      },
      {
            "name": "💷 Credits 50",
            "message": "Enjoy your new account credit!"
      }
]
  },
  "winners": {
    label: "🎉 Winners",
    templates: [
      {
            "name": "🎉 Winners 01",
            "message": "Congratulations—you won!"
      },
      {
            "name": "🎉 Winners 02",
            "message": "Winner alert—check your prize!"
      },
      {
            "name": "🎉 Winners 03",
            "message": "You're a Prize League winner!"
      },
      {
            "name": "🎉 Winners 04",
            "message": "Victory! Your reward is ready!"
      },
      {
            "name": "🎉 Winners 05",
            "message": "You made the winners list!"
      },
      {
            "name": "🎉 Winners 06",
            "message": "Great news—you've won!"
      },
      {
            "name": "🎉 Winners 07",
            "message": "Winner status confirmed!"
      },
      {
            "name": "🎉 Winners 08",
            "message": "Your winning reward awaits!"
      },
      {
            "name": "🎉 Winners 09",
            "message": "Congratulations, Champion!"
      },
      {
            "name": "🎉 Winners 10",
            "message": "You finished as a winner!"
      },
      {
            "name": "🎉 Winners 11",
            "message": "Your prize-winning result is in!"
      },
      {
            "name": "🎉 Winners 12",
            "message": "Winner alert—great job!"
      },
      {
            "name": "🎉 Winners 13",
            "message": "You did it—check your reward!"
      },
      {
            "name": "🎉 Winners 14",
            "message": "A winning prize awaits you!"
      },
      {
            "name": "🎉 Winners 15",
            "message": "Congratulations on your win!"
      },
      {
            "name": "🎉 Winners 16",
            "message": "Your winning result is live!"
      },
      {
            "name": "🎉 Winners 17",
            "message": "You're officially a winner!"
      },
      {
            "name": "🎉 Winners 18",
            "message": "Victory reward is ready!"
      },
      {
            "name": "🎉 Winners 19",
            "message": "Winner confirmed—check now!"
      },
      {
            "name": "🎉 Winners 20",
            "message": "Your win has been published!"
      },
      {
            "name": "🎉 Winners 21",
            "message": "Celebrate—you made it!"
      },
      {
            "name": "🎉 Winners 22",
            "message": "A winner's reward awaits!"
      },
      {
            "name": "🎉 Winners 23",
            "message": "Your victory is confirmed!"
      },
      {
            "name": "🎉 Winners 24",
            "message": "Congratulations—prize ready!"
      },
      {
            "name": "🎉 Winners 25",
            "message": "You earned a winning spot!"
      },
      {
            "name": "🎉 Winners 26",
            "message": "Winner news just arrived!"
      },
      {
            "name": "🎉 Winners 27",
            "message": "Your winning prize is ready!"
      },
      {
            "name": "🎉 Winners 28",
            "message": "You reached the winners list!"
      },
      {
            "name": "🎉 Winners 29",
            "message": "Victory unlocked—well done!"
      },
      {
            "name": "🎉 Winners 30",
            "message": "Winner alert—open account!"
      },
      {
            "name": "🎉 Winners 31",
            "message": "Your result is a winner!"
      },
      {
            "name": "🎉 Winners 32",
            "message": "Congratulations—check prize!"
      },
      {
            "name": "🎉 Winners 33",
            "message": "You claimed a winning place!"
      },
      {
            "name": "🎉 Winners 34",
            "message": "Your victory reward arrived!"
      },
      {
            "name": "🎉 Winners 35",
            "message": "Winning status is now live!"
      },
      {
            "name": "🎉 Winners 36",
            "message": "You're on the winners board!"
      },
      {
            "name": "🎉 Winners 37",
            "message": "Prize winner—congratulations!"
      },
      {
            "name": "🎉 Winners 38",
            "message": "Your winning moment is here!"
      },
      {
            "name": "🎉 Winners 39",
            "message": "Winner confirmed—great work!"
      },
      {
            "name": "🎉 Winners 40",
            "message": "You earned the prize!"
      },
      {
            "name": "🎉 Winners 41",
            "message": "Your winning result is ready!"
      },
      {
            "name": "🎉 Winners 42",
            "message": "Celebrate your Prize League win!"
      },
      {
            "name": "🎉 Winners 43",
            "message": "A prize-winning finish!"
      },
      {
            "name": "🎉 Winners 44",
            "message": "Congratulations—you're in!"
      },
      {
            "name": "🎉 Winners 45",
            "message": "Winner reward now available!"
      },
      {
            "name": "🎉 Winners 46",
            "message": "Your victory has been posted!"
      },
      {
            "name": "🎉 Winners 47",
            "message": "Winning alert—check account!"
      },
      {
            "name": "🎉 Winners 48",
            "message": "You made the podium!"
      },
      {
            "name": "🎉 Winners 49",
            "message": "Your winner prize awaits!"
      },
      {
            "name": "🎉 Winners 50",
            "message": "Big congratulations—you won!"
      }
]
  }
};

const PRIZE_LEAGUE_URL = 'https://prizeleague.co.uk/';

const CATEGORY_KEYS = Object.keys(TEMPLATE_CATEGORIES);

const ALERT_TYPES = [
  ['custom', 'Custom'],
  ['championship_open', 'Championship Open'],
  ['championship_closing', 'Championship Closing'],
  ['winner', 'Winner'],
  ['promotion', 'Promotion'],
  ['credit', 'Credit'],
];

function CountCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value ?? 0}</div>
    </div>
  );
}

export default function AlertsAdmin() {
  const [form, setForm] = useState({
    user_from: 1,
    user_to: 1000,
    alert_type: 'custom',
    title: '',
    message: '',
    channels: ['in_app'],
  });
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [filter, setFilter] = useState({ status: '', channel: '' });
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [templateCategory, setTemplateCategory] = useState(CATEGORY_KEYS[0]);

  // Recipient targeting (audience)
  const [audienceMode, setAudienceMode] = useState('range');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [pasteText, setPasteText] = useState('');
  const [winnerSources, setWinnerSources] = useState({ paid_contest: [], promotion_draw: [], free_world: [] });
  const [winnerSource, setWinnerSource] = useState('free_world');
  const [winnerRef, setWinnerRef] = useState('all');
  const [winnerPreview, setWinnerPreview] = useState(null);

  useEffect(() => {
    adminAPI.alertWinnerSources()
      .then((d) => setWinnerSources(d?.sources || { paid_contest: [], promotion_draw: [], free_world: [] }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (audienceMode !== 'users' || searchQ.trim().length < 2) { setSearchResults([]); return undefined; }
    const t = setTimeout(() => {
      adminAPI.alertUserSearch(searchQ.trim())
        .then((d) => setSearchResults(d?.users || []))
        .catch(() => setSearchResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQ, audienceMode]);

  const addUser = (u) => {
    setSelectedUsers((prev) => prev.find((x) => x.user_id === u.user_id) ? prev : [...prev, u]);
    setSearchQ('');
    setSearchResults([]);
  };
  const removeUser = (uid) => setSelectedUsers((prev) => prev.filter((x) => x.user_id !== uid));

  const addPasted = () => {
    const tokens = pasteText.split(/[\s,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const existing = new Set(selectedUsers.map((u) => u.public_id || u.user_id));
    const additions = tokens
      .filter((t) => !existing.has(t))
      .map((t) => ({ user_id: t, public_id: t, name: null, email: /@/.test(t) ? t : null, _raw: true }));
    setSelectedUsers((prev) => [...prev, ...additions]);
    setPasteText('');
  };

  const loadWinners = async () => {
    try {
      const d = await adminAPI.alertWinners(winnerSource, winnerRef);
      setWinnerPreview(d);
    } catch {
      setWinnerPreview({ count: 0, users: [] });
    }
  };

  const targetCount = useMemo(() => {
    if (audienceMode === 'users') return selectedUsers.length;
    if (audienceMode === 'winners') return winnerPreview?.count ?? 0;
    const a = Number(form.user_from) || 0;
    const b = Number(form.user_to) || 0;
    return b >= a && a > 0 ? b - a + 1 : 0;
  }, [audienceMode, selectedUsers.length, winnerPreview, form.user_from, form.user_to]);

  const loadCampaigns = async () => {
    try {
      const data = await adminAPI.alertCampaigns(100);
      setCampaigns(data?.campaigns || []);
    } catch (e) {
      setError(e?.response?.data?.detail || 'Unable to load alert campaigns.');
    }
  };

  useEffect(() => { loadCampaigns(); }, []);

  const toggleChannel = (channel) => {
    setForm(prev => ({
      ...prev,
      channels: prev.channels.includes(channel)
        ? prev.channels.filter(x => x !== channel)
        : [...prev.channels, channel],
    }));
  };

  const applyTemplate = (index) => {
    if (index === '') return;
    const t = TEMPLATE_CATEGORIES[templateCategory].templates[Number(index)];
    setForm(prev => ({ ...prev, title: t.name, message: t.message }));
  };

  const send = async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!form.channels.length) {
      setError('Select at least one delivery channel.');
      return;
    }
    if (audienceMode === 'users' && !selectedUsers.length) {
      setError('Add at least one recipient.');
      return;
    }
    if (audienceMode === 'winners' && !(winnerPreview?.count)) {
      setError('Load winners for the selected source first.');
      return;
    }
    const confirmText = audienceMode === 'range'
      ? `Send this alert to up to ${targetCount.toLocaleString()} users?`
      : `Send this alert to ${targetCount.toLocaleString()} selected recipient(s)?`;
    if (!window.confirm(confirmText)) return;
    setLoading(true);
    try {
      const shouldIncludeWebsite = form.channels.some(channel => channel === 'email' || channel === 'sms');
      const messageWithWebsite = shouldIncludeWebsite && !form.message.includes(PRIZE_LEAGUE_URL)
        ? `${form.message.trim()}\n\nPlay now: ${PRIZE_LEAGUE_URL}`
        : form.message;

      const base = {
        title: form.title,
        message: messageWithWebsite,
        alert_type: form.alert_type,
        channels: form.channels,
      };
      let payload;
      if (audienceMode === 'users') {
        payload = {
          ...base,
          audience: {
            mode: 'users',
            identifiers: selectedUsers.map((u) => u.public_id || u.user_id),
          },
        };
      } else if (audienceMode === 'winners') {
        payload = {
          ...base,
          audience: { mode: 'winners', winner_source: winnerSource, winner_ref: winnerRef },
        };
      } else {
        payload = {
          ...base,
          user_from: Number(form.user_from),
          user_to: Number(form.user_to),
          audience: { mode: 'range' },
        };
      }

      const result = await adminAPI.createAlertCampaign(payload);
      setNotice(`Campaign created. ${result?.targeted_count ?? 0} users targeted.`);
      await loadCampaigns();
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Alert campaign failed.');
    } finally {
      setLoading(false);
    }
  };

  const openCampaign = async (id) => {
    setDetailLoading(true);
    setError('');
    try {
      const [campaign, deliveryData] = await Promise.all([
        adminAPI.alertCampaign(id),
        adminAPI.alertDeliveries(id, { limit: 200 }),
      ]);
      setSelected(campaign);
      setDeliveries(deliveryData?.deliveries || []);
      setFilter({ status: '', channel: '' });
    } catch (e) {
      setError(e?.response?.data?.detail || 'Unable to load campaign.');
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDeliveries = async () => {
    if (!selected?.campaign_id) return;
    setDetailLoading(true);
    try {
      const params = { limit: 500 };
      if (filter.status) params.status = filter.status;
      if (filter.channel) params.channel = filter.channel;
      const [campaign, data] = await Promise.all([
        adminAPI.alertCampaign(selected.campaign_id),
        adminAPI.alertDeliveries(selected.campaign_id, params),
      ]);
      setSelected(campaign);
      setDeliveries(data?.deliveries || []);
    } finally {
      setDetailLoading(false);
    }
  };

  const counts = selected?.delivery_counts || {};
  const sumStatus = (status) =>
    Object.values(counts).reduce((n, c) => n + Number(c?.[status] || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-[#6C2BFF]" />
          <h1 className="text-2xl font-bold text-slate-900">Alerts</h1>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Send and track in-app, email and SMS campaigns by registered-user range.
        </p>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

      <form onSubmit={send} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-5">
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">Recipients</div>
          <div className="flex flex-wrap gap-2">
            {[['range','Registration range'],['users','Specific users'],['winners','Winners']].map(([v,l]) => (
              <button key={v} type="button" onClick={() => setAudienceMode(v)}
                data-testid={`audience-mode-${v}`}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${audienceMode === v ? 'border-[#6C2BFF] bg-[#6C2BFF] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{l}</button>
            ))}
          </div>
        </div>

        {audienceMode === 'range' && (
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            From user #
            <input type="number" min="1" value={form.user_from} onChange={e => setForm({...form, user_from:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            To user #
            <input type="number" min="1" value={form.user_to} onChange={e => setForm({...form, user_to:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="text-xs font-bold uppercase text-slate-500">Maximum target</div>
            <div className="mt-1 text-2xl font-bold">{targetCount.toLocaleString()}</div>
            <div className="text-xs text-slate-500">Maximum 10,000 per campaign</div>
          </div>
        </div>
        )}

        {audienceMode === 'users' && (
        <div className="space-y-3" data-testid="audience-users">
          <div className="relative">
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} data-testid="user-search-input"
              placeholder="Search by name, email, username or account ID…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            {searchResults.length > 0 && (
              <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {searchResults.map(u => (
                  <button key={u.user_id} type="button" onClick={() => addUser(u)}
                    data-testid={`user-search-result-${u.user_id}`}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-violet-50">
                    <span><span className="font-semibold">{u.name || u.public_id}</span> <span className="text-slate-400">{u.email}</span></span>
                    <span className="text-xs text-slate-400">{u.public_id}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows="2" data-testid="paste-identifiers"
              placeholder="Paste account IDs or emails (comma, space or newline separated)…"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button type="button" onClick={addPasted} data-testid="add-pasted-btn"
              className="mt-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Add pasted</button>
          </div>
          <div className="flex flex-wrap gap-2" data-testid="selected-recipients">
            {selectedUsers.map(u => (
              <span key={u.user_id} className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                {u.public_id || u.user_id}
                <button type="button" onClick={() => removeUser(u.user_id)} className="hover:text-violet-900">×</button>
              </span>
            ))}
            {!selectedUsers.length && <span className="text-xs text-slate-400">No recipients selected yet.</span>}
          </div>
          <div className="text-xs font-semibold text-slate-600">{selectedUsers.length} recipient(s) selected</div>
        </div>
        )}

        {audienceMode === 'winners' && (
        <div className="space-y-3" data-testid="audience-winners">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700">
              Winner source
              <select value={winnerSource} onChange={e => { setWinnerSource(e.target.value); setWinnerRef('all'); setWinnerPreview(null); }}
                data-testid="winner-source" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                <option value="free_world">Free World Champions</option>
                <option value="paid_contest">Paid Contest Winners</option>
                <option value="promotion_draw">Promotion Draw Winners</option>
              </select>
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Contest / draw
              <select value={winnerRef} onChange={e => { setWinnerRef(e.target.value); setWinnerPreview(null); }}
                data-testid="winner-ref" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
                {winnerSource !== 'free_world' && <option value="all">All</option>}
                {(winnerSources[winnerSource] || []).map(o => (
                  <option key={o.ref} value={o.ref}>{o.label}{o.count != null ? ` (${o.count})` : ''}</option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button type="button" onClick={loadWinners} data-testid="load-winners-btn"
                className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Load winners</button>
            </div>
          </div>
          <div className="text-xs font-semibold text-slate-600" data-testid="winners-count">
            {winnerPreview ? `${winnerPreview.count} winner(s) found` : 'No winners loaded yet.'}
          </div>
        </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            Alert type
            <select value={form.alert_type} onChange={e => setForm({...form, alert_type:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2">
              {ALERT_TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Message category
            <select
              value={templateCategory}
              onChange={e => setTemplateCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {CATEGORY_KEYS.map(key => (
                <option key={key} value={key}>
                  {TEMPLATE_CATEGORIES[key].label}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            50 messages in category
            <select
              key={templateCategory}
              defaultValue=""
              onChange={e => applyTemplate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Choose a message template…</option>
              {TEMPLATE_CATEGORIES[templateCategory].templates.map((t,i) => (
                <option key={i} value={i}>{i + 1}. {t.message}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-slate-700">Channels</div>
          <div className="flex flex-wrap gap-2">
            {[['in_app','In-App'],['email','Email'],['sms','SMS']].map(([v,l]) => (
              <button key={v} type="button" onClick={() => toggleChannel(v)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${form.channels.includes(v) ? 'border-[#6C2BFF] bg-[#6C2BFF] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>{l}</button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Email and SMS stay Pending until their delivery providers are connected. In-app sends immediately.</p>
        </div>

        <label className="block text-sm font-semibold text-slate-700">
          Title
          <input required maxLength="160" value={form.title} onChange={e => setForm({...form,title:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Alert title" />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          Message
          <textarea required maxLength="4000" rows="5" value={form.message} onChange={e => setForm({...form,message:e.target.value})} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Write your message…" />
          <span className="mt-1 block text-right text-xs text-slate-400">{form.message.length} / 4000</span>
        </label>

        <button disabled={loading || targetCount < 1 || targetCount > 10000} className="inline-flex items-center gap-2 rounded-xl bg-[#6C2BFF] px-5 py-3 font-bold text-white disabled:opacity-50">
          <Send className="h-4 w-4" /> {loading ? 'Sending…' : 'Send Alert'}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-bold text-slate-900">Campaign History</h2>
          <button onClick={loadCampaigns} className="rounded-lg border border-slate-200 p-2"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Campaign</th><th className="p-3">Range</th><th className="p-3">Targeted</th><th className="p-3">Channels</th><th className="p-3">Status</th></tr></thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.campaign_id} onClick={() => openCampaign(c.campaign_id)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                  <td className="p-3"><div className="font-semibold">{c.title}</div><div className="text-xs text-slate-400">{c.campaign_id}</div></td>
                  <td className="p-3">{c.user_from}–{c.user_to}</td>
                  <td className="p-3">{c.targeted_count ?? 0}</td>
                  <td className="p-3">{(c.channels || []).join(', ')}</td>
                  <td className="p-3">{c.status}</td>
                </tr>
              ))}
              {!campaigns.length && <tr><td colSpan="5" className="p-8 text-center text-slate-400">No alert campaigns yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-bold text-slate-900">{selected.title}</h2><p className="text-xs text-slate-400">{selected.campaign_id}</p></div>
            <button onClick={refreshDeliveries} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"><RefreshCw className={`h-4 w-4 ${detailLoading ? 'animate-spin' : ''}`} /> Refresh</button>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <CountCard label="Targeted" value={selected.targeted_count} icon={Users} />
            <CountCard label="Sent" value={sumStatus('sent')} icon={CheckCircle2} />
            <CountCard label="Pending" value={sumStatus('pending')} icon={Clock3} />
            <CountCard label="Skipped" value={sumStatus('skipped')} icon={Ban} />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={filter.status} onChange={e => setFilter({...filter,status:e.target.value})} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">All statuses</option><option value="sent">Sent</option><option value="pending">Pending</option><option value="skipped">Skipped</option><option value="failed">Failed</option>
            </select>
            <select value={filter.channel} onChange={e => setFilter({...filter,channel:e.target.value})} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">All channels</option><option value="in_app">In-App</option><option value="email">Email</option><option value="sms">SMS</option>
            </select>
            <button onClick={refreshDeliveries} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Apply</button>
          </div>
          <div className="max-h-[420px] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">User #</th><th className="p-3">User ID</th><th className="p-3">Channel</th><th className="p-3">Status</th><th className="p-3">Reason</th></tr></thead>
              <tbody>
                {deliveries.map(d => <tr key={d.delivery_id} className="border-t border-slate-100"><td className="p-3">{d.user_position}</td><td className="p-3 font-mono text-xs">{d.user_id}</td><td className="p-3">{d.channel}</td><td className="p-3 font-semibold">{d.status}</td><td className="p-3 text-slate-500">{d.reason || '—'}</td></tr>)}
                {!deliveries.length && <tr><td colSpan="5" className="p-8 text-center text-slate-400">No delivery records for this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

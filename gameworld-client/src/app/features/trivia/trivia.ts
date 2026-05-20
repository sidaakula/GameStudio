import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { UserService } from '../../shared/user.service';

interface TriviaQuestion {
  question: string;
  options: string[];
  answer: string;
  hint: string;
}

@Component({
  selector: 'app-trivia',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './trivia.html',
  styleUrls: ['./trivia.css']
})
export class Trivia implements OnInit, OnDestroy {
  ageInput: number = 10;
  selectedTopic: string = 'pokemon';
  gameState: 'start' | 'loading' | 'playing' | 'gameover' = 'start';
  isSoundEnabled: boolean = true;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  
  questions: TriviaQuestion[] = [];
  currentQuestionIndex: number = 0;
  score: number = 0;
  correctCount: number = 0;
  
  timeLeft: number = 60;
  timerInterval: any = null;
  
  selectedOption: string | null = null;
  showAnswer: boolean = false;
  showHint: boolean = false;
  isSubmitting: boolean = false;
  
  feedbackMessage: string = '';
  feedbackType: 'correct' | 'incorrect' | '' = '';
  askedQuestionTexts: Set<string> = new Set<string>();

  // Background Pre-fetching Fields
  prefetchedQuestions: TriviaQuestion[] | null = null;
  prefetchPromise: Promise<TriviaQuestion[] | null> | null = null;
  prefetchTopic: string = '';
  prefetchAge: number = 0;

  topics = [
    { id: 'pokemon', name: 'Pokémon', icon: '⚡', desc: 'Character names & evolution lines' },
    { id: 'minecraft', name: 'Minecraft', icon: '⛏️', desc: 'Weapons, Wither summon & crafting' },
    { id: 'brawl stars', name: 'Brawl Stars', icon: '⭐', desc: 'Rarity tiers, clone skills & trophies' },
    { id: 'fortnite', name: 'Fortnite', icon: '⚔️', desc: 'Weapon rarities & building moves' },
    { id: 'superheros', name: 'Superheroes', icon: '🦸', desc: 'Spider-Mans, MCU, Batman & Green Lantern' }
  ];

  constructor(public userService: UserService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Proactively prefetch default topic & age on component initialization
    this.triggerPrefetch();
  }

  selectTopic(topicId: string) {
    this.selectedTopic = topicId;
    this.triggerPrefetch();
  }

  onAgeChange() {
    this.triggerPrefetch();
  }

  private triggerPrefetch() {
    const topic = this.selectedTopic;
    const age = this.ageInput;

    // Do not prefetch if age input is invalid
    if (age < 1 || age > 120) return;

    // If we've already started prefetching or successfully completed prefetching for this exact topic + age, bypass
    if (this.prefetchTopic === topic && this.prefetchAge === age) {
      return;
    }

    this.prefetchTopic = topic;
    this.prefetchAge = age;
    this.prefetchedQuestions = null;

    this.prefetchPromise = (async () => {
      try {
        const response = await fetch(`/api/trivia/questions?topic=${encodeURIComponent(topic)}&age=${age}`);
        if (response.ok) {
          const challenge = await response.json();
          if (challenge && challenge.questions && challenge.questions.length > 0) {
            // Guard against the user changing settings while the asynchronous fetch was in flight
            if (this.prefetchTopic === topic && this.prefetchAge === age) {
              this.prefetchedQuestions = challenge.questions;
              return challenge.questions;
            }
          }
        }
      } catch (err) {
        console.warn("Background prefetch failed:", err);
      }
      return null;
    })();
  }

  async startGame() {
    if (this.ageInput < 1 || this.ageInput > 120) {
      alert("Please enter a valid age between 1 and 120.");
      return;
    }

    this.gameState = 'loading';
    this.score = 0;
    this.correctCount = 0;
    this.currentQuestionIndex = 0;
    this.timeLeft = 60;
    this.selectedOption = null;
    this.showAnswer = false;
    this.showHint = false;
    this.feedbackMessage = '';
    this.feedbackType = '';
    this.askedQuestionTexts.clear();

    // Ensure we trigger a prefetch in case they just typed an age and clicked start instantly
    this.triggerPrefetch();

    try {
      let qs: TriviaQuestion[] | null = this.prefetchedQuestions;

      if (!qs && this.prefetchPromise) {
        // Await the active background pre-fetch task
        qs = await this.prefetchPromise;
      }

      if (!qs) {
        // Fallback: If prefetch failed or didn't finish, do a direct fetch
        const response = await fetch(`/api/trivia/questions?topic=${encodeURIComponent(this.selectedTopic)}&age=${this.ageInput}`);
        if (response.ok) {
          const challenge = await response.json();
          if (challenge && challenge.questions && challenge.questions.length > 0) {
            qs = challenge.questions;
          }
        }
      }

      if (qs && qs.length > 0) {
        this.questions = this.shuffleQuestionOptions(qs);
        if (this.questions.length > 0) {
          this.askedQuestionTexts.add(this.questions[0].question.trim().toLowerCase());
        }
        this.gameState = 'playing';
        this.startTimer();
        this.speakCurrentQuestion();
        
        // Optimistically pre-fetch the next round's questions in the background!
        this.prefetchedQuestions = null;
        this.prefetchPromise = null;
        this.triggerPrefetch();
        this.cdr.detectChanges();
        return;
      }

      throw new Error("Failed to load questions");
    } catch (err) {
      console.error("Failed to load trivia questions from API. Utilizing client-side backup...", err);
      this.loadClientFallbackQuestions();
      this.questions = this.shuffleQuestionOptions(this.questions);
      if (this.questions.length > 0) {
        this.askedQuestionTexts.add(this.questions[0].question.trim().toLowerCase());
      }
      this.gameState = 'playing';
      this.startTimer();
      this.speakCurrentQuestion();
      this.cdr.detectChanges();
    }
  }

  startTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endGame();
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  selectOption(option: string) {
    if (this.showAnswer) return;
    
    this.selectedOption = option;
    this.showAnswer = true;
    const currentQ = this.questions[this.currentQuestionIndex];
    
    if (option.trim().toLowerCase() === currentQ.answer.trim().toLowerCase()) {
      this.correctCount++;
      this.score += 10;
      this.feedbackMessage = '✨ CORRECT! ✨';
      this.feedbackType = 'correct';
    } else {
      this.feedbackMessage = `❌ INCORRECT! Answer: ${currentQ.answer}`;
      this.feedbackType = 'incorrect';
    }

    this.cdr.detectChanges();

    setTimeout(() => {
      this.nextQuestion();
    }, 1500);
  }

  async nextQuestion() {
    this.selectedOption = null;
    this.showAnswer = false;
    this.showHint = false;
    this.feedbackMessage = '';
    this.feedbackType = '';
    
    this.currentQuestionIndex++;
    
    // Check for victory first (10 correct answers)
    if (this.correctCount >= 10) {
      this.endGame();
      return;
    }

    // If we run out of questions, fetch/load more dynamically
    if (this.currentQuestionIndex >= this.questions.length) {
      await this.loadMoreQuestions();
    }

    // Absolute guard if loading questions failed or timed out
    if (this.currentQuestionIndex >= this.questions.length) {
      this.endGame();
      return;
    }

    // Register this question text to prevent repeats
    const currentQ = this.questions[this.currentQuestionIndex];
    if (currentQ) {
      this.askedQuestionTexts.add(currentQ.question.trim().toLowerCase());
    }

    this.speakCurrentQuestion();
    this.cdr.detectChanges();
  }

  toggleHint() {
    this.showHint = !this.showHint;
    this.cdr.detectChanges();
  }

  endGame() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.gameState = 'gameover';
    this.submitScore();
  }

  async submitScore() {
    const playerName = this.userService.getUsername();
    if (!playerName) return;

    this.isSubmitting = true;
    this.cdr.detectChanges();
    try {
      await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameName: 'TriviaAI',
          playerName: playerName,
          score: this.score
        })
      });
    } catch (err) {
      console.error('Failed to submit score to leaderboard', err);
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  loadClientFallbackQuestions() {
    this.questions = this.getClientFallbackList();
  }

  getClientFallbackList(): TriviaQuestion[] {
    const topic = this.selectedTopic.toLowerCase();
    let list: TriviaQuestion[] = [];

    if (topic.includes('pokemon')) {
      list = [
        { question: "Which of these is a famous Electric-type Pokémon character?", options: ["Pikachu", "Charizard", "Squirtle", "Bulbasaur"], answer: "Pikachu", hint: "He is the yellow mascot of Pokémon!" },
        { question: "What is the correct evolution order for the fire starter Pokémon?", options: ["Charmander -> Charmeleon -> Charizard", "Pikachu -> Raichu -> Pichu", "Squirtle -> Blastoise -> Wartortle", "Bulbasaur -> Venusaur -> Ivysaur"], answer: "Charmander -> Charmeleon -> Charizard", hint: "Charmander evolves into Charmeleon, then into Charizard!" },
        { question: "Which Pokémon evolves into Gyarados?", options: ["Magikarp", "Psyduck", "Goldeen", "Tentacool"], answer: "Magikarp", hint: "It is a weak fish that splashes around." },
        { question: "What type of Pokémon is Gengar?", options: ["Ghost/Poison", "Water/Ice", "Fire/Flying", "Electric/Steel"], answer: "Ghost/Poison", hint: "A spooky shadow Pokémon." },
        { question: "Which of these is a legendary Pokémon?", options: ["Mewtwo", "Meowth", "Eevee", "Machop"], answer: "Mewtwo", hint: "Created in a lab from Mew's DNA." },
        { question: "How many evolutions does Eevee have currently?", options: ["8", "3", "5", "10"], answer: "8", hint: "Includes Vaporeon, Jolteon, Flareon, etc." },
        { question: "What is the final evolution of Squirtle?", options: ["Blastoise", "Wartortle", "Shellshocker", "Terapagos"], answer: "Blastoise", hint: "A giant turtle with water cannons on its shell." },
        { question: "Which Pokémon is known as the 'Seed Pokémon'?", options: ["Bulbasaur", "Oddish", "Chikorita", "Treecko"], answer: "Bulbasaur", hint: "First Pokémon in the Kanto Pokedex." },
        { question: "What item is used to evolve Pikachu into Raichu?", options: ["Thunder Stone", "Fire Stone", "Water Stone", "Leaf Stone"], answer: "Thunder Stone", hint: "An elemental stone with a lightning bolt symbol." },
        { question: "Which Pokémon character is famous for sleeping and blocking roads?", options: ["Snorlax", "Slaking", "Slowbro", "Munchlax"], answer: "Snorlax", hint: "You need a Poké Flute to wake him up." }
      ];
    } else if (topic.includes('minecraft')) {
      list = [
        { question: "Which weapon deals the most raw damage per single hit in Minecraft?", options: ["Netherite Axe", "Netherite Sword", "Diamond Sword", "Iron Axe"], answer: "Netherite Axe", hint: "Axes deal slower but heavier hits than swords in modern versions." },
        { question: "How do you summon the Wither boss in Minecraft?", options: ["4 Soul Sand in a T-shape and 3 Wither Skeleton Skulls on top", "3 Obsidian blocks and 1 Nether Star", "4 Iron Blocks in a T-shape and a Carved Pumpkin", "4 Soul Soil in a square and 3 Wither Skulls"], answer: "4 Soul Sand in a T-shape and 3 Wither Skeleton Skulls on top", hint: "You need soul sand/soil and skulls from Wither skeletons." },
        { question: "What material is needed to mine Obsidian?", options: ["Diamond or Netherite Pickaxe", "Iron Pickaxe", "Stone Pickaxe", "Golden Pickaxe"], answer: "Diamond or Netherite Pickaxe", hint: "Only the strongest tools can crack obsidian." },
        { question: "What dimension do you travel to by building a portal out of Obsidian and lighting it?", options: ["The Nether", "The End", "The Aether", "The Deep Dark"], answer: "The Nether", hint: "A fiery red dimension full of lava." },
        { question: "What blocks are used to summon an Iron Golem?", options: ["4 Iron Blocks and 1 Carved Pumpkin", "4 Iron Ore and 1 Jack o'Lantern", "3 Iron Blocks and 1 Pumpkin", "4 Steel Blocks and 1 Pumpkin"], answer: "4 Iron Blocks and 1 Carved Pumpkin", hint: "Build a T-shape with iron blocks and put a pumpkin head on top." },
        { question: "Which of these is NOT a weapon or tool in Minecraft?", options: ["Copper Shield", "Trident", "Mace", "Crossbow"], answer: "Copper Shield", hint: "Shields are made of wood and iron, there is no copper shield." },
        { question: "How do you make a Netherite weapon?", options: ["Combine a Diamond weapon with a Netherite Ingot in a Smithing Table", "Craft it with 3 Netherite Ingots and 2 Sticks", "Smelt a Diamond weapon in a Furnace", "Combine Gold and Iron in a Crafting Table"], answer: "Combine a Diamond weapon with a Netherite Ingot in a Smithing Table", hint: "Requires a Smithing Table and a Smithing Template." },
        { question: "What creature is green, makes a hissing sound, and explodes?", options: ["Creeper", "Zombie", "Enderman", "Skeleton"], answer: "Creeper", hint: "Minecraft's iconic exploding mob." },
        { question: "How do you defeat the Ender Dragon?", options: ["Destroy the End Crystals, then hit the Dragon", "Use a Water Bucket on its head", "Lure it into a portal", "Give it a Golden Apple"], answer: "Destroy the End Crystals, then hit the Dragon", hint: "The towers heal the dragon, so destroy the crystals first." },
        { question: "What ore gives you redstone dust?", options: ["Redstone Ore", "Lapis Lazuli Ore", "Ruby Ore", "Copper Ore"], answer: "Redstone Ore", hint: "It glows when you punch it." }
      ];
    } else if (topic.includes('stars') || topic.includes('brawl')) {
      list = [
        { question: "Which of these brawlers belongs to the RARE rarity tier?", options: ["Poco", "Shelly", "Leon", "Spike"], answer: "Poco", hint: "He is a skeleton musician who heals with music!" },
        { question: "In which regular Brawl Stars game mode do you gain exactly 11 trophies for a first-place victory?", options: ["Solo Showdown", "Brawl Ball", "Gem Grab", "Knockout"], answer: "Solo Showdown", hint: "The ultimate battle royale mode where you go solo." },
        { question: "Which brawler is famous for being able to clone themselves?", options: ["Leon", "Colt", "El Primo", "Piper"], answer: "Leon", hint: "His gadget creates a clone of himself." },
        { question: "Which brawler is a legendary tier character that shoots sharp cactus needles?", options: ["Spike", "Crow", "Sandy", "Amber"], answer: "Spike", hint: "He is a cute, silent cactus mascot." },
        { question: "What is the primary objective in the Gem Grab game mode?", options: ["Collect and hold 10 gems as a team until the countdown ends", "Defeat 10 opponents", "Score 2 goals with a soccer ball", "Destroy the enemy safe"], answer: "Collect and hold 10 gems as a team until the countdown ends", hint: "Grab the shiny gems from the mine in the center." },
        { question: "Which of these brawlers is in the EPIC rarity tier?", options: ["Piper", "Poco", "Colt", "El Primo"], answer: "Piper", hint: "A sniper princess who shoots from her umbrella." },
        { question: "What is the maximum number of players in a standard showdown match?", options: ["10", "6", "8", "12"], answer: "10", hint: "It is a 10-player battle royale." },
        { question: "Which brawler heals teammates with their primary guitar attacks?", options: ["Poco", "Colt", "Bull", "Brock"], answer: "Poco", hint: "He says 'Feel the power of music!'" },
        { question: "Which brawler has a Super that lets them jump high into the air and smash down, breaking walls?", options: ["El Primo", "Barley", "Rosa", "Nita"], answer: "El Primo", hint: "An awesome luchador wrestler!" },
        { question: "What brawler is a legendary assassin that throws poison daggers?", options: ["Crow", "Leon", "Spike", "Chester"], answer: "Crow", hint: "A sleek black bird." }
      ];
    } else if (topic.includes('fortnite')) {
      list = [
        { question: "What color corresponds to a RARE tier item or weapon in Fortnite?", options: ["Blue", "Green", "Purple", "Gold"], answer: "Blue", hint: "Rarity order is Common (Grey), Uncommon (Green), Rare (Blue), Epic (Purple), Legendary (Gold)." },
        { question: "What is the most famous and essential building technique used to gain height quickly?", options: ["Cranking 90s", "Double Ramp", "Boxing up", "Skybasing"], answer: "Cranking 90s", hint: "Building two walls, a floor, and a ramp, then turning 90 degrees." },
        { question: "What is the maximum shield value a player can have under normal conditions?", options: ["100", "50", "150", "200"], answer: "100", hint: "You can have 100 Health and 100 Shield." },
        { question: "What material has the highest health when fully built in Fortnite?", options: ["Metal", "Stone", "Wood", "Brick"], answer: "Metal", hint: "It takes the longest to build but has the most health." },
        { question: "What is the name of the flying bus that players jump out of at the start of a match?", options: ["Battle Bus", "Party Bus", "Storm Bus", "Glider Bus"], answer: "Battle Bus", hint: "It has a big blue balloon on top." },
        { question: "Which item is used to rapidly travel across the map or rotate in Fortnite?", options: ["Launch Pad", "Bandage", "Shield Potion", "Chug Splash"], answer: "Launch Pad", hint: "You place it down and bounce off it to re-deploy your glider." },
        { question: "Which tier of weapon is better than Epic but below Mythic?", options: ["Legendary", "Rare", "Uncommon", "Common"], answer: "Legendary", hint: "It glows with a bright golden light." },
        { question: "What currency is used in the Fortnite Item Shop to buy skins?", options: ["V-Bucks", "Gold Bars", "Robux", "Minecoins"], answer: "V-Bucks", hint: "Named after the 'V' on the coin." },
        { question: "How many players start in a standard battle royale match?", options: ["100", "50", "80", "150"], answer: "100", hint: "A classic century-player dropship." },
        { question: "What happens when you stay inside the purple glowing area on the map?", options: ["You take damage from the Storm", "You get extra shield", "You fly into the air", "You gain speed"], answer: "You take damage from the Storm", hint: "Avoid the shrinking storm circle!" }
      ];
    } else {
      list = [
        { question: "Who are the actors that played Spider-Man in the three major live-action movie series?", options: ["Tobey Maguire, Andrew Garfield, Tom Holland", "Christian Bale, Ben Affleck, Robert Pattinson", "Robert Downey Jr., Chris Evans, Chris Hemsworth", "Tom Hardy, Ryan Reynolds, Hugh Jackman"], answer: "Tobey Maguire, Andrew Garfield, Tom Holland", hint: "They teamed up in Spider-Man: No Way Home!" },
        { question: "In which Marvel Cinematic Universe movie does Iron Man make the ultimate sacrifice and die?", options: ["Avengers: Endgame", "Avengers: Infinity War", "Captain America: Civil War", "Iron Man 3"], answer: "Avengers: Endgame", hint: "He snaps his fingers and says 'I am Iron Man.'" },
        { question: "What is the real civilian name of the Hulk?", options: ["Bruce Banner", "Bruce Wayne", "Peter Parker", "Clark Kent"], answer: "Bruce Banner", hint: "He is a brilliant nuclear physicist who got exposed to gamma rays." },
        { question: "Who is widely considered to be Batman's ultimate arch-enemy?", options: ["The Joker", "Lex Luthor", "Green Goblin", "Loki"], answer: "The Joker", hint: "The Clown Prince of Crime." },
        { question: "What is Green Lantern's classic, famous weakness?", options: ["The color Yellow", "Water", "Kryptonite", "Fire"], answer: "The color Yellow", hint: "It represents fear in the emotional spectrum." },
        { question: "What is the real name of Batman?", options: ["Bruce Wayne", "Clark Kent", "Tony Stark", "Steve Rogers"], answer: "Bruce Wayne", hint: "A billionaire orphan living in Gotham City." },
        { question: "What planet is Superman originally from?", options: ["Krypton", "Mars", "Asgard", "Earth"], answer: "Krypton", hint: "It exploded right after he was sent to Earth." },
        { question: "What is Thor's famous hammer called?", options: ["Mjolnir", "Stormbreaker", "Gungnir", "Vibranium"], answer: "Mjolnir", hint: "Only those who are worthy can lift it." },
        { question: "Who is Peter Parker's beloved aunt who raised him?", options: ["Aunt May", "Aunt Sarah", "Aunt Lois", "Aunt Pepper"], answer: "Aunt May", hint: "She tells him that with great power comes great responsibility." },
        { question: "What metal is bonded to Wolverine's entire skeleton?", options: ["Adamantium", "Vibranium", "Netherite", "Titanium"], answer: "Adamantium", hint: "Virtually indestructible fictional metal." }
      ];
    }

    return list;
  }

  async loadMoreQuestions() {
    try {
      let newQs: TriviaQuestion[] | null = this.prefetchedQuestions;

      if (!newQs && this.prefetchPromise) {
        newQs = await this.prefetchPromise;
      }

      if (!newQs) {
        const response = await fetch(`/api/trivia/questions?topic=${encodeURIComponent(this.selectedTopic)}&age=${this.ageInput}`);
        if (response.ok) {
          const challenge = await response.json();
          if (challenge && challenge.questions && challenge.questions.length > 0) {
            newQs = challenge.questions;
          }
        }
      }

      if (!newQs || newQs.length === 0) {
        newQs = this.getClientFallbackList();
      }

      if (newQs && newQs.length > 0) {
        // Filter out already asked questions to avoid duplication
        let filtered = newQs.filter(q => !this.askedQuestionTexts.has(q.question.trim().toLowerCase()));
        
        // If all available questions are duplicates, reuse them to prevent halting gameplay
        if (filtered.length === 0) {
          filtered = newQs;
        }

        const shuffledFiltered = this.shuffleQuestionOptions(filtered);
        this.questions = [...this.questions, ...shuffledFiltered];

        // Trigger a new background pre-fetch for the next round
        this.prefetchedQuestions = null;
        this.prefetchPromise = null;
        this.triggerPrefetch();
      }
    } catch (err) {
      console.warn("Failed to load more questions dynamically. Appending fallback questions.", err);
      let newQs = this.getClientFallbackList();
      let filtered = newQs.filter(q => !this.askedQuestionTexts.has(q.question.trim().toLowerCase()));
      if (filtered.length === 0) {
        filtered = newQs;
      }
      const shuffledFiltered = this.shuffleQuestionOptions(filtered);
      this.questions = [...this.questions, ...shuffledFiltered];
    }
  }

  shuffleQuestionOptions(questions: TriviaQuestion[]): TriviaQuestion[] {
    return questions.map(q => {
      const optionsCopy = [...q.options];
      for (let i = optionsCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [optionsCopy[i], optionsCopy[j]] = [optionsCopy[j], optionsCopy[i]];
      }
      return {
        ...q,
        options: optionsCopy
      };
    });
  }

  toggleSound() {
    this.isSoundEnabled = !this.isSoundEnabled;
    if (!this.isSoundEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    } else {
      this.speakCurrentQuestion();
    }
    this.cdr.detectChanges();
  }

  speakCurrentQuestion() {
    if (!this.isSoundEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    if (this.questions.length > 0 && this.currentQuestionIndex < this.questions.length) {
      const q = this.questions[this.currentQuestionIndex];
      
      let speechText = q.question;
      if (q.options && q.options.length > 0) {
        speechText += ". ";
        q.options.forEach((opt) => {
          speechText += `${opt}. `;
        });
      }

      this.currentUtterance = new SpeechSynthesisUtterance(speechText);
      this.currentUtterance.rate = 1.05; // slightly punchy fast reading speed
      this.currentUtterance.pitch = 1.0;
      window.speechSynthesis.speak(this.currentUtterance);
    }
  }
}

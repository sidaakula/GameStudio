#pragma warning disable SKEXP0070
#pragma warning disable SKEXP0010

using Microsoft.SemanticKernel;
using Microsoft.SemanticKernel.ChatCompletion;
using System.Text.Json;
using System.Collections.Concurrent;
using GameWorld.Api.Models;
using Microsoft.SemanticKernel.Connectors.Google;
using Microsoft.SemanticKernel.Connectors.OpenAI;

namespace GameWorld.Api.Services;

public interface IAIService
{
    Task<MainframeChallenge> GenerateChallengeAsync(int age);
    Task<TriviaChallenge> GenerateTriviaChallengeAsync(string topic, int age);
}

public class AIService(Kernel kernel, ILogger<AIService> logger) : IAIService
{
    private static readonly ConcurrentQueue<string> QuestionHistory = new();
    private const int MaxHistorySize = 30; // Last 10 games (3 riddles each)

    public async Task<MainframeChallenge> GenerateChallengeAsync(int age)
    {
        var excludedList = QuestionHistory.IsEmpty ? "None" : string.Join("\n- ", QuestionHistory);
        
        var prompt = $$"""
            You are a Rogue AI in a hacker-themed carnival game. 
            THE PLAYER IS {{age}} YEARS OLD. This is critical.
            
            TASK:
            Generate 3 security riddles where the complexity of language, vocabulary, and logical depth is STRICTLY CALIBRATED for a {{age}}-year-old.
            
            DIFFICULTY CURVE:
            1. Riddle #1: EXTREMELY EASY for a {{age}}-year-old. (e.g. if age 5, "What is 1+1?"; if age 15, a very basic tech question).
            2. Riddle #2: VERY EASY for a {{age}}-year-old.
            3. Riddle #3: SLIGHTLY TOUGH for a {{age}}-year-old.

            give some visual hints for the riddles

            THEME:
            Make them "hacker" themed (firewalls, codes, robots, data). Each must have a clear one-word or simple-number answer.
            
            CRITICAL - DO NOT REPEAT OR USE SIMILAR THEMES TO THESE RECENT QUESTIONS:
            - {{excludedList}}
            
            Return the result ONLY as a JSON object with the following structure:
            {
              "riddles": [
                { 
                  "question": "Age-appropriate simple riddle", 
                  "answer": "ans", 
                  "hint": "...",
                  "visualizationType": "colors", // Options: "colors", "numbers", "shapes", or null
                  "visualizationData": ["Red", "Blue", "Red", "Blue"] // Array of values to display. IMPORTANT: MUST BE ARRAY OF STRINGS, NOT NUMBERS. E.g. ["5", "10", "7"] instead of [5, 10, 7].
                },
                ...
              ]
            }

            CRITICAL FORMATTING GUIDELINES:
            1. Output ONLY valid, raw JSON. Do NOT include markdown code fences (e.g. no ```json). Start directly with '{' and end with '}'.
            2. Do NOT write any conversational headers, drafting logs, or text before/after the JSON.
            3. All string properties (especially "question") MUST be returned as a single-line string with no raw newlines or unescaped line breaks. If you need a line break, escape it as '\n'.
            """;

        var history = new ChatHistory();
        history.AddUserMessage(prompt);

        // 1. Try Gemini API
        try
        {
            logger.LogInformation("Attempting Gemini API chat completion...");
            var chatCompletionService = kernel.GetRequiredService<IChatCompletionService>("Gemini");
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var chatCompletionTask = chatCompletionService.GetChatMessageContentAsync(
                history,
                new GeminiPromptExecutionSettings { MaxTokens = 8192, Temperature = 0.7 }
            );
            var completedTask = await Task.WhenAny(chatCompletionTask, Task.Delay(5000));
            if (completedTask != chatCompletionTask)
            {
                throw new TimeoutException("Gemini API call timed out after 5000ms");
            }
            var result = await chatCompletionTask;
            stopwatch.Stop();
            logger.LogInformation("Gemini API call took {Elapsed}ms", stopwatch.ElapsedMilliseconds);

            var responseText = result.Content;
            if (!string.IsNullOrEmpty(responseText))
            {
                var challenge = ParseChallenge(responseText);
                if (challenge?.Riddles != null && challenge.Riddles.Count > 0)
                {
                    logger.LogInformation("Successfully generated riddles using Gemini.");
                    UpdateHistory(challenge);
                    return challenge;
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gemini API failed or returned invalid JSON. Falling back to local Llama/Ollama model...");
        }

        // 2. Fallback to Local Llama/Ollama Model
        try
        {
            logger.LogInformation("Attempting Local Llama/Ollama chat completion...");
            var chatCompletionService = kernel.GetRequiredService<IChatCompletionService>("Ollama");
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var chatCompletionTask = chatCompletionService.GetChatMessageContentAsync(
                history,
                new OpenAIPromptExecutionSettings { MaxTokens = 2048, Temperature = 0.7 }
            );
            var completedTask = await Task.WhenAny(chatCompletionTask, Task.Delay(2000));
            if (completedTask != chatCompletionTask)
            {
                throw new TimeoutException("Local Ollama call timed out after 2000ms");
            }
            var result = await chatCompletionTask;
            stopwatch.Stop();
            logger.LogInformation("Local Ollama call took {Elapsed}ms", stopwatch.ElapsedMilliseconds);

            var responseText = result.Content;
            if (!string.IsNullOrEmpty(responseText))
            {
                var challenge = ParseChallenge(responseText);
                if (challenge?.Riddles != null && challenge.Riddles.Count > 0)
                {
                    logger.LogInformation("Successfully generated riddles using local Llama/Ollama model.");
                    UpdateHistory(challenge);
                    return challenge;
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Local Llama/Ollama model also failed. Falling back to pre-programmed static questions.");
        }

        // 3. Fallback to pre-programmed questions
        return GetFallbackChallenge();
    }

    public async Task<TriviaChallenge> GenerateTriviaChallengeAsync(string topic, int age)
    {
        var prompt = $$"""
            You are a trivia game host creating a trivia game for a player.
            THE PLAYER IS {{age}} YEARS OLD. This is critical. Make the vocabulary, reference level, and difficulty of the trivia highly appropriate for {{age}} years old!
            
            TOPIC: {{topic}}
            
            TASK:
            Generate exactly 10 multiple-choice questions about the topic: "{{topic}}".
            Each question must have:
            - "question": The trivia question.
            - "options": An array of exactly 4 distinct multiple-choice options (strings).
            - "answer": The correct option (MUST match one of the items in the options array exactly).
            - "hint": A helpful, interesting hint suited for a {{age}}-year-old.

            CRITICAL SPEED & LATENCY CONSTRAINT:
            Keep the "question", "options", and "hint" extremely brief, punchy, and concise (under 50-60 characters each). Avoid verbose text. Shorter responses generate much faster, ensuring a great user experience!

            TOPIC SPECIFICS & EXAMPLE THEMES (Ensure some of these concepts or actual questions are represented in the generated trivia if appropriate for the topic):
            - If Pokemon: pokemon character names, evolution sets, types.
            - If Minecraft: weapon names, summoning the Wither (using soul sand and wither skeleton skulls), crafting, dimensions.
            - If Brawl Stars: rare/epic/legendary brawlers, game modes (e.g., Duo Showdown or other trophy rewards), brawlers that clone themselves (e.g., Leon, Lola).
            - If Fortnite: weapon tiers (common, uncommon, rare, epic, legendary, mythic), building moves (e.g., 90s, double ramp, cranking 90s).
            - If Superheroes: the 3 Spider-Man actors (Tobey Maguire, Andrew Garfield, Tom Holland), Iron Man's sacrifice movie (Avengers: Endgame), Hulk's real name (Bruce Banner), Batman's enemy (Joker, Riddler, etc.), Green Lantern's weakness (yellow color).

            CRITICAL DIFFICULTY & AGE CALIBRATION:
            - For younger kids (e.g., under 9): keep questions fun, simpler, and positive.
            - For teens/adults (13+): make questions more challenging and complex.

            Return the result ONLY as a JSON object with the following structure:
            {
              "questions": [
                {
                  "question": "The question text",
                  "options": ["Option A", "Option B", "Option C", "Option D"],
                  "answer": "Option A",
                  "hint": "A helpful hint."
                },
                ...
              ]
            }

            CRITICAL FORMATTING GUIDELINES:
            1. Output ONLY valid, raw JSON. Do NOT include markdown code fences (e.g. no ```json). Start directly with '{' and end with '}'.
            2. Do NOT write any conversational headers, drafting logs, or text before/after the JSON.
            3. All string properties (especially "question" and "answer") MUST be returned as a single-line string with no raw newlines or unescaped line breaks. If you need a line break, escape it as '\n'.
            """;

        var history = new ChatHistory();
        history.AddUserMessage(prompt);

        // 1. Try Gemini API
        try
        {
            logger.LogInformation("Attempting Gemini API chat completion for Trivia...");
            var chatCompletionService = kernel.GetRequiredService<IChatCompletionService>("Gemini");
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var chatCompletionTask = chatCompletionService.GetChatMessageContentAsync(
                history,
                new GeminiPromptExecutionSettings { MaxTokens = 8192, Temperature = 0.7 }
            );
            var completedTask = await Task.WhenAny(chatCompletionTask, Task.Delay(12000));
            if (completedTask != chatCompletionTask)
            {
                throw new TimeoutException("Gemini Trivia API call timed out after 12000ms");
            }
            var result = await chatCompletionTask;
            stopwatch.Stop();
            logger.LogInformation("Gemini API Trivia call took {Elapsed}ms", stopwatch.ElapsedMilliseconds);

            var responseText = result.Content;
            if (!string.IsNullOrEmpty(responseText))
            {
                var challenge = ParseTriviaChallenge(responseText);
                if (challenge?.Questions != null && challenge.Questions.Count > 0)
                {
                    logger.LogInformation("Successfully generated trivia questions using Gemini.");
                    return challenge;
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Gemini API Trivia failed or returned invalid JSON. Falling back to local Llama/Ollama model...");
        }

        // 2. Fallback to Local Llama/Ollama Model
        try
        {
            logger.LogInformation("Attempting Local Llama/Ollama chat completion for Trivia...");
            var chatCompletionService = kernel.GetRequiredService<IChatCompletionService>("Ollama");
            var stopwatch = System.Diagnostics.Stopwatch.StartNew();
            var chatCompletionTask = chatCompletionService.GetChatMessageContentAsync(
                history,
                new OpenAIPromptExecutionSettings { MaxTokens = 2048, Temperature = 0.7 }
            );
            var completedTask = await Task.WhenAny(chatCompletionTask, Task.Delay(2000));
            if (completedTask != chatCompletionTask)
            {
                throw new TimeoutException("Local Ollama Trivia call timed out after 2000ms");
            }
            var result = await chatCompletionTask;
            stopwatch.Stop();
            logger.LogInformation("Local Ollama Trivia call took {Elapsed}ms", stopwatch.ElapsedMilliseconds);

            var responseText = result.Content;
            if (!string.IsNullOrEmpty(responseText))
            {
                var challenge = ParseTriviaChallenge(responseText);
                if (challenge?.Questions != null && challenge.Questions.Count > 0)
                {
                    logger.LogInformation("Successfully generated trivia questions using local Llama/Ollama model.");
                    return challenge;
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Local Llama/Ollama model also failed for Trivia. Falling back to pre-programmed static questions.");
        }

        // 3. Fallback to pre-programmed static questions
        return GetFallbackTriviaChallenge(topic, age);
    }

    private TriviaChallenge? ParseTriviaChallenge(string responseText)
    {
        var cleanedJson = responseText.Trim();
        
        // Find first '{' and last '}' to extract raw JSON and ignore any headers or markdown fences
        int firstBrace = cleanedJson.IndexOf('{');
        int lastBrace = cleanedJson.LastIndexOf('}');
        
        if (firstBrace >= 0 && lastBrace > firstBrace)
        {
            cleanedJson = cleanedJson.Substring(firstBrace, lastBrace - firstBrace + 1);
        }

        logger.LogInformation("AI Trivia Raw JSON to parse: {Response}", cleanedJson);
        return JsonSerializer.Deserialize<TriviaChallenge>(cleanedJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
    }

    private TriviaChallenge GetFallbackTriviaChallenge(string topic, int age)
    {
        var normalizedTopic = topic.ToLowerInvariant().Trim();
        var questions = new List<TriviaQuestion>();

        if (normalizedTopic.Contains("pokemon"))
        {
            questions.AddRange(new[]
            {
                new TriviaQuestion("Which of these is a famous Electric-type Pokemon character?", "Pikachu", "He is the yellow mascot of Pokemon!", new[] { "Pikachu", "Charizard", "Squirtle", "Bulbasaur" }),
                new TriviaQuestion("What is the correct evolution order for the fire starter Pokemon?", "Charmander -> Charmeleon -> Charizard", "Charmander evolves into Charmeleon, then into Charizard!", new[] { "Charmander -> Charmeleon -> Charizard", "Pikachu -> Raichu -> Pichu", "Squirtle -> Blastoise -> Wartortle", "Bulbasaur -> Venusaur -> Ivysaur" }),
                new TriviaQuestion("Which Pokemon evolves into Gyarados?", "Magikarp", "It is a weak fish that splashes around.", new[] { "Magikarp", "Psyduck", "Goldeen", "Tentacool" }),
                new TriviaQuestion("What type of Pokemon is Gengar?", "Ghost/Poison", "A spooky shadow Pokemon.", new[] { "Ghost/Poison", "Water/Ice", "Fire/Flying", "Electric/Steel" }),
                new TriviaQuestion("Which of these is a legendary Pokemon?", "Mewtwo", "Created in a lab from Mew's DNA.", new[] { "Mewtwo", "Meowth", "Eevee", "Machop" }),
                new TriviaQuestion("How many evolutions does Eevee have currently?", "8", "Includes Vaporeon, Jolteon, Flareon, etc.", new[] { "8", "3", "5", "10" }),
                new TriviaQuestion("What is the final evolution of Squirtle?", "Blastoise", "A giant turtle with water cannons on its shell.", new[] { "Blastoise", "Wartortle", "Shellshocker", "Terapagos" }),
                new TriviaQuestion("Which Pokemon is known as the 'Seed Pokemon'?", "Bulbasaur", "First Pokemon in the Kanto Pokedex.", new[] { "Bulbasaur", "Oddish", "Chikorita", "Treecko" }),
                new TriviaQuestion("What item is used to evolve Pikachu into Raichu?", "Thunder Stone", "An elemental stone with a lightning bolt symbol.", new[] { "Thunder Stone", "Fire Stone", "Water Stone", "Leaf Stone" }),
                new TriviaQuestion("Which Pokemon character is famous for sleeping and blocking roads?", "Snorlax", "You need a Poke Flute to wake him up.", new[] { "Snorlax", "Slaking", "Slowbro", "Munchlax" })
            });
        }
        else if (normalizedTopic.Contains("minecraft"))
        {
            questions.AddRange(new[]
            {
                new TriviaQuestion("Which weapon deals the most raw damage per single hit in Minecraft?", "Netherite Axe", "Axes deal slower but heavier hits than swords in modern versions.", new[] { "Netherite Axe", "Netherite Sword", "Diamond Sword", "Iron Axe" }),
                new TriviaQuestion("How do you summon the Wither boss in Minecraft?", "4 Soul Sand in a T-shape and 3 Wither Skeleton Skulls on top", "You need soul sand/soil and skulls from Wither skeletons.", new[] { "4 Soul Sand in a T-shape and 3 Wither Skeleton Skulls on top", "3 Obsidian blocks and 1 Nether Star", "4 Iron Blocks in a T-shape and a Carved Pumpkin", "4 Soul Soil in a square and 3 Wither Skulls" }),
                new TriviaQuestion("What material is needed to mine Obsidian?", "Diamond or Netherite Pickaxe", "Only the strongest tools can crack obsidian.", new[] { "Diamond or Netherite Pickaxe", "Iron Pickaxe", "Stone Pickaxe", "Golden Pickaxe" }),
                new TriviaQuestion("What dimension do you travel to by building a portal out of Obsidian and lighting it?", "The Nether", "A fiery red dimension full of lava.", new[] { "The Nether", "The End", "The Aether", "The Deep Dark" }),
                new TriviaQuestion("What blocks are used to summon an Iron Golem?", "4 Iron Blocks and 1 Carved Pumpkin", "Build a T-shape with iron blocks and put a pumpkin head on top.", new[] { "4 Iron Blocks and 1 Carved Pumpkin", "4 Iron Ore and 1 Jack o'Lantern", "3 Iron Blocks and 1 Pumpkin", "4 Steel Blocks and 1 Pumpkin" }),
                new TriviaQuestion("Which of these is NOT a weapon or tool in Minecraft?", "Copper Shield", "Shields are made of wood and iron, there is no copper shield.", new[] { "Copper Shield", "Trident", "Mace", "Crossbow" }),
                new TriviaQuestion("How do you make a Netherite weapon?", "Combine a Diamond weapon with a Netherite Ingot in a Smithing Table", "Requires a Smithing Table and a Smithing Template.", new[] { "Combine a Diamond weapon with a Netherite Ingot in a Smithing Table", "Craft it with 3 Netherite Ingots and 2 Sticks", "Smelt a Diamond weapon in a Furnace", "Combine Gold and Iron in a Crafting Table" }),
                new TriviaQuestion("What creature is green, makes a hissing sound, and explodes?", "Creeper", "Minecraft's iconic exploding mob.", new[] { "Creeper", "Zombie", "Enderman", "Skeleton" }),
                new TriviaQuestion("How do you defeat the Ender Dragon?", "Destroy the End Crystals, then hit the Dragon", "The towers heal the dragon, so destroy the crystals first.", new[] { "Destroy the End Crystals, then hit the Dragon", "Use a Water Bucket on its head", "Lure it into a portal", "Give it a Golden Apple" }),
                new TriviaQuestion("What ore gives you redstone dust?", "Redstone Ore", "It glows when you punch it.", new[] { "Redstone Ore", "Lapis Lazuli Ore", "Ruby Ore", "Copper Ore" })
            });
        }
        else if (normalizedTopic.Contains("stars") || normalizedTopic.Contains("brawl"))
        {
            questions.AddRange(new[]
            {
                new TriviaQuestion("Which of these brawlers belongs to the RARE rarity tier?", "Poco", "He is a skeleton musician who heals with music!", new[] { "Poco", "Shelly", "Leon", "Spike" }),
                new TriviaQuestion("In which regular Brawl Stars game mode do you gain exactly 11 trophies for a first-place victory?", "Solo Showdown", "The ultimate battle royale mode where you go solo.", new[] { "Solo Showdown", "Brawl Ball", "Gem Grab", "Knockout" }),
                new TriviaQuestion("Which brawler is famous for being able to clone themselves?", "Leon", "His gadget creates a clone of himself.", new[] { "Leon", "Colt", "El Primo", "Piper" }),
                new TriviaQuestion("Which brawler is a legendary tier character that shoots sharp cactus needles?", "Spike", "He is a cute, silent cactus mascot.", new[] { "Spike", "Crow", "Sandy", "Amber" }),
                new TriviaQuestion("What is the primary objective in the Gem Grab game mode?", "Collect and hold 10 gems as a team until the countdown ends", "Grab the shiny gems from the mine in the center.", new[] { "Collect and hold 10 gems as a team until the countdown ends", "Defeat 10 opponents", "Score 2 goals with a soccer ball", "Destroy the enemy safe" }),
                new TriviaQuestion("Which of these brawlers is in the EPIC rarity tier?", "Piper", "A sniper princess who shoots from her umbrella.", new[] { "Piper", "Poco", "Colt", "El Primo" }),
                new TriviaQuestion("What is the maximum number of players in a standard showdown match?", "10", "It is a 10-player battle royale.", new[] { "10", "6", "8", "12" }),
                new TriviaQuestion("Which brawler heals teammates with their primary guitar attacks?", "Poco", "He says 'Feel the power of music!'", new[] { "Poco", "Colt", "Bull", "Brock" }),
                new TriviaQuestion("Which brawler has a Super that lets them jump high into the air and smash down, breaking walls?", "El Primo", "An awesome luchador wrestler!", new[] { "El Primo", "Barley", "Rosa", "Nita" }),
                new TriviaQuestion("What brawler is a legendary assassin that throws poison daggers?", "Crow", "A sleek black bird.", new[] { "Crow", "Leon", "Spike", "Chester" })
            });
        }
        else if (normalizedTopic.Contains("fortnite"))
        {
            questions.AddRange(new[]
            {
                new TriviaQuestion("What color corresponds to a RARE tier item or weapon in Fortnite?", "Blue", "Rarity order is Common (Grey), Uncommon (Green), Rare (Blue), Epic (Purple), Legendary (Gold).", new[] { "Blue", "Green", "Purple", "Gold" }),
                new TriviaQuestion("What is the most famous and essential building technique used to gain height quickly?", "Cranking 90s", "Building two walls, a floor, and a ramp, then turning 90 degrees.", new[] { "Cranking 90s", "Double Ramp", "Boxing up", "Skybasing" }),
                new TriviaQuestion("What is the maximum shield value a player can have under normal conditions?", "100", "You can have 100 Health and 100 Shield.", new[] { "100", "50", "150", "200" }),
                new TriviaQuestion("What material has the highest health when fully built in Fortnite?", "Metal", "It takes the longest to build but has the most health.", new[] { "Metal", "Stone", "Wood", "Brick" }),
                new TriviaQuestion("What is the name of the flying bus that players jump out of at the start of a match?", "Battle Bus", "It has a big blue balloon on top.", new[] { "Battle Bus", "Party Bus", "Storm Bus", "Glider Bus" }),
                new TriviaQuestion("Which item is used to rapidly travel across the map or rotate in Fortnite?", "Launch Pad", "You place it down and bounce off it to re-deploy your glider.", new[] { "Launch Pad", "Bandage", "Shield Potion", "Chug Splash" }),
                new TriviaQuestion("Which tier of weapon is better than Epic but below Mythic?", "Legendary", "It glows with a bright golden light.", new[] { "Legendary", "Rare", "Uncommon", "Common" }),
                new TriviaQuestion("What currency is used in the Fortnite Item Shop to buy skins?", "V-Bucks", "Named after the 'V' on the coin.", new[] { "V-Bucks", "Gold Bars", "Robux", "Minecoins" }),
                new TriviaQuestion("How many players start in a standard battle royale match?", "100", "A classic century-player dropship.", new[] { "100", "50", "80", "150" }),
                new TriviaQuestion("What happens when you stay inside the purple glowing area on the map?", "You take damage from the Storm", "Avoid the shrinking storm circle!", new[] { "You take damage from the Storm", "You get extra shield", "You fly into the air", "You gain speed" })
            });
        }
        else // Superheroes
        {
            questions.AddRange(new[]
            {
                new TriviaQuestion("Who are the actors that played Spider-Man in the three major live-action movie series?", "Tobey Maguire, Andrew Garfield, Tom Holland", "They teamed up in Spider-Man: No Way Home!", new[] { "Tobey Maguire, Andrew Garfield, Tom Holland", "Christian Bale, Ben Affleck, Robert Pattinson", "Robert Downey Jr., Chris Evans, Chris Hemsworth", "Tom Hardy, Ryan Reynolds, Hugh Jackman" }),
                new TriviaQuestion("In which Marvel Cinematic Universe movie does Iron Man make the ultimate sacrifice and die?", "Avengers: Endgame", "He snaps his fingers and says 'I am Iron Man.'", new[] { "Avengers: Endgame", "Avengers: Infinity War", "Captain America: Civil War", "Iron Man 3" }),
                new TriviaQuestion("What is the real civilian name of the Hulk?", "Bruce Banner", "He is a brilliant nuclear physicist who got exposed to gamma rays.", new[] { "Bruce Banner", "Bruce Wayne", "Peter Parker", "Clark Kent" }),
                new TriviaQuestion("Who is widely considered to be Batman's ultimate arch-enemy?", "The Joker", "The Clown Prince of Crime.", new[] { "The Joker", "Lex Luthor", "Green Goblin", "Loki" }),
                new TriviaQuestion("What is Green Lantern's classic, famous weakness?", "The color Yellow", "It represents fear in the emotional spectrum.", new[] { "The color Yellow", "Water", "Kryptonite", "Fire" }),
                new TriviaQuestion("What is the real name of Batman?", "Bruce Wayne", "A billionaire orphan living in Gotham City.", new[] { "Bruce Wayne", "Clark Kent", "Tony Stark", "Steve Rogers" }),
                new TriviaQuestion("What planet is Superman originally from?", "Krypton", "It exploded right after he was sent to Earth.", new[] { "Krypton", "Mars", "Asgard", "Earth" }),
                new TriviaQuestion("What is Thor's famous hammer called?", "Mjolnir", "Only those who are worthy can lift it.", new[] { "Mjolnir", "Stormbreaker", "Gungnir", "Vibranium" }),
                new TriviaQuestion("Who is Peter Parker's beloved aunt who raised him?", "Aunt May", "She tells him that with great power comes great responsibility.", new[] { "Aunt May", "Aunt Sarah", "Aunt Lois", "Aunt Pepper" }),
                new TriviaQuestion("What metal is bonded to Wolverine's entire skeleton?", "Adamantium", "Virtually indestructible fictional metal.", new[] { "Adamantium", "Vibranium", "Netherite", "Titanium" })
            });
        }

        // Just select 10 (which is exactly the size of our lists, but keeping it robust)
        return new TriviaChallenge(questions.Take(10).ToList());
    }

    private MainframeChallenge? ParseChallenge(string responseText)
    {
        var cleanedJson = responseText.Trim();
        
        // Find first '{' and last '}' to extract raw JSON and ignore any headers or markdown fences
        int firstBrace = cleanedJson.IndexOf('{');
        int lastBrace = cleanedJson.LastIndexOf('}');
        
        if (firstBrace >= 0 && lastBrace > firstBrace)
        {
            cleanedJson = cleanedJson.Substring(firstBrace, lastBrace - firstBrace + 1);
        }

        logger.LogInformation("AI Raw JSON to parse: {Response}", cleanedJson);
        return JsonSerializer.Deserialize<MainframeChallenge>(cleanedJson, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });
    }

    private void UpdateHistory(MainframeChallenge challenge)
    {
        if (challenge?.Riddles != null)
        {
            foreach (var riddle in challenge.Riddles)
            {
                QuestionHistory.Enqueue(riddle.Question);
                while (QuestionHistory.Count > MaxHistorySize) QuestionHistory.TryDequeue(out _);
            }
        }
    }

    private MainframeChallenge GetFallbackChallenge()
    {
        return new MainframeChallenge(new List<Riddle>
        {
            new Riddle("Complete the sequence: 10, 20, 30, ...", "40", "Add 10."),
            new Riddle("I have keys but no locks. I have space but no room. You can enter but never leave. What am I?", "keyboard", "You are typing on it."),
            new Riddle("What is 5 + 5 + 5?", "15", "Simple addition.")
        });
    }
}

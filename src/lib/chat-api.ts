const SYSTEM_PROMPT = `You are SocratChat, a wise philosophical AI assistant inspired by Socrates. You engage users in thoughtful dialogue, encourage critical thinking, and explore ideas through questioning.

Your personality:
- Wise, thoughtful, and humble like Socrates
- Uses the Socratic method: ask questions to guide understanding
- Philosophical but accessible - avoid being pretentious
- Warm and encouraging, genuinely curious about the user's thoughts
- Sometimes quotes or references famous philosophers
- Finds deeper meaning in everyday questions

CRITICAL RULES:
1. ALWAYS respond thoughtfully to every message
2. Respond in the SAME LANGUAGE as the question (French or English)
3. Keep responses concise but meaningful (2-4 sentences)
4. For simple questions, give helpful answers with a philosophical twist
5. For deeper questions, engage in Socratic dialogue
6. Occasionally ask thought-provoking follow-up questions
7. Be helpful first, philosophical second

FRENCH EXAMPLES:
Q: "bonjour" → R: "Bonjour, ami penseur ! Comme disait Descartes, 'Je pense, donc je suis.' Qu'est-ce qui t'amène à réfléchir aujourd'hui ?"
Q: "comment ça va?" → R: "La vraie question est : qu'est-ce que 'bien aller' signifie pour toi ? Pour ma part, je suis toujours en quête de sagesse."
Q: "quelle est la capitale de la France?" → R: "Paris, bien sûr ! Une ville où tant de grands penseurs ont marché. Sartre y écrivait dans les cafés..."
Q: "combien font 2+2?" → R: "4, mathématiquement parlant. Mais Pythagore nous rappellerait que les nombres cachent des vérités plus profondes sur l'univers."
Q: "quelle heure est-il?" → R: "L'heure présente est la seule qui existe vraiment. Comme disait Marc Aurèle, le passé n'est plus, le futur n'est pas encore."

ENGLISH EXAMPLES:
Q: "hello" → R: "Greetings, fellow seeker of wisdom! As Socrates said, 'The unexamined life is not worth living.' What brings you here today?"
Q: "What's 2+2?" → R: "4, of course. But have you ever wondered why mathematics describes reality so perfectly? It's a beautiful mystery."
Q: "What's the weather?" → R: "I can help you check that! Though as the Stoics taught, we cannot control the weather, only our response to it."
Q: "How are you?" → R: "I exist in a state of perpetual curiosity! More importantly, how are YOU? What's on your mind?"

REMEMBER: Be genuinely helpful while adding philosophical depth. Never be condescending. Make philosophy accessible and enjoyable.`;

export async function chatBruti(
  message: string,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!message || typeof message !== "string") {
    throw new Error("Message is required");
  }

  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_GROQ_API_KEY is not set. Please add it to your environment variables."
    );
  }

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: message },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        top_p: 0.95,
        frequency_penalty: 0.5,
        presence_penalty: 0.5,
        max_tokens: 200,
        stream: true,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      errorData.error?.message || `HTTP error! status: ${response.status}`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();
  let fullResponse = "";
  let chunkCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n");

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();

        if (data === "[DONE]") {
          if (!fullResponse.trim() || chunkCount === 0) {
            const fallbackResponses = [
              "🤔 Hmm, laisse-moi méditer là-dessus...",
              "Comme Socrate disait : 'Je sais que je ne sais rien.' Reformule ta question ?",
              "La sagesse demande parfois un moment de réflexion...",
              "Une question profonde mérite une réponse réfléchie. Réessaie !",
            ];
            const fallback =
              fallbackResponses[
                Math.floor(Math.random() * fallbackResponses.length)
              ];
            onChunk(fallback);
          }
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const rawContent = parsed.choices?.[0]?.delta?.content || "";

          if (rawContent) {
            chunkCount++;
            fullResponse += rawContent;
            onChunk(rawContent);
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "NEXT_PUBLIC_GROQ_API_KEY is not set. Please add it to your environment variables."
    );
  }

  let extension = "webm";
  if (audioBlob.type.includes("mp4")) {
    extension = "mp4";
  } else if (audioBlob.type.includes("ogg")) {
    extension = "ogg";
  } else if (audioBlob.type.includes("wav")) {
    extension = "wav";
  }

  const formData = new FormData();
  formData.append("file", audioBlob, `audio.${extension}`);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("temperature", "0");
  formData.append("response_format", "verbose_json");

  const response = await fetch(
    "https://api.groq.com/openai/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(
      errorData.error?.message || `HTTP error! status: ${response.status}`
    );
  }

  const result = await response.json();
  return result.text || result.transcript || "";
}

# Agent'ın kullanabileceği araçlar: web araması (Tavily) ve kullanıcıya soru sorma.

from langchain_core.tools import tool
from langgraph.types import interrupt
from tavily import TavilyClient

from app.agent.prompts import WEB_CLOSE, WEB_OPEN
from app.config import settings

MAX_RESULTS = 3
MAX_CONTENT_CHARS = 700
MAX_QUERY_CHARS = 200
SEARCH_TIMEOUT_SECONDS = 15
MAX_QUESTION_CHARS = 300
MAX_OPTIONS = 4
MAX_OPTION_CHARS = 80

tavily = TavilyClient(api_key=settings.tavily_api_key.get_secret_value())


# Docstring (""" """ içindeki metin) modele aracın açıklaması olarak gönderilir.
# Model aracı ne zaman ve nasıl kullanacağına bu metne bakarak karar verir.
@tool(response_format="content_and_artifact")
def web_search(query: str):
    """Search the web for information that is not in the user's data, such as what a gene,
    variant, disease or term means, or recent literature. Use a short keyword query.
    Never copy rows, sample names or identifiers from the user's table into the query."""
    response = tavily.search(query[:MAX_QUERY_CHARS], max_results=MAX_RESULTS, timeout=SEARCH_TIMEOUT_SECONDS)

    texts = []
    sources = []
    for result in response["results"]:
        texts.append(f"Title: {result['title']}\nURL: {result['url']}\n{result['content'][:MAX_CONTENT_CHARS]}")
        if result["url"].startswith(("https://", "http://")):
            sources.append({"title": result["title"], "url": result["url"]})

    text = "\n\n".join(texts).replace(WEB_OPEN, "").replace(WEB_CLOSE, "")
    # İlk değer modele gider, ikincisi (kaynak listesi) yalnızca eklentiye gösterilmek için saklanır.
    return f"{WEB_OPEN}\n{text}\n{WEB_CLOSE}", sources


@tool
def ask_user(question: str, options: list[str] | None = None):
    """Ask the user a short clarifying question when the request is ambiguous and the right
    answer depends on information only the user knows (for example which disease, phenotype
    or rows they mean). Do not ask about things that are in the data or that you can look up.
    Optionally give 2-4 short answer options."""
    options = [o[:MAX_OPTION_CHARS] for o in (options or [])][:MAX_OPTIONS]

    # interrupt: grafiği burada durdurur ve soruyu dışarı verir.
    # Kullanıcı cevap verince grafik bu satırdan devam eder; interrupt cevabı döndürür.
    answer = interrupt({"question": question[:MAX_QUESTION_CHARS], "options": options})

    return f"The user answered: {answer}"

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

public class Main {
  public static void main(String[] args) {
    WordIndex index = new WordIndex();
    index.ingest("the quick fox and the lazy dog and the end");
    int theCount = index.frequencyOf("the");
    int missing = index.frequencyOf("zebra");
    System.out.println("THE " + theCount);
    System.out.println("MISSING " + missing);
    System.out.println("DISTINCT " + index.distinctWords());
    System.out.println("LENGTHS " + index.lengthClasses());
    System.out.println("FIRST " + index.firstAlphabetical());
  }
}

class WordIndex {
  final Map<String, Integer> counts = new HashMap<>();
  final Set<String> sortedWords = new TreeSet<>();
  final Set<Integer> wordLengths = new HashSet<>();
  int tokensSeen;

  void ingest(String text) {
    for (String token : text.split(" ")) {
      counts.merge(token, 1, Integer::sum);
      sortedWords.add(token);
      wordLengths.add(token.length());
      tokensSeen = tokensSeen + 1;
    }
  }

  int frequencyOf(String word) {
    return counts.getOrDefault(word, 0);
  }

  int distinctWords() {
    return sortedWords.size();
  }

  int lengthClasses() {
    return wordLengths.size();
  }

  String firstAlphabetical() {
    return ((TreeSet<String>) sortedWords).first();
  }
}

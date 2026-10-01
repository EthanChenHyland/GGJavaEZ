public class Main {
  public static void main(String[] args) {
    ConfigLoader loader = new ConfigLoader();
    int accepted = 0;
    try {
      accepted = loader.load("port=8080;threads=4;timeout=-5");
      System.out.println("UNEXPECTED " + accepted);
    } catch (ConfigException failure) {
      System.out.println("RECOVERED " + failure.getMessage());
    } finally {
      loader.close();
    }
    int retry = loader.loadLenient("port=9090;threads=2");
    System.out.println("RETRY " + retry);
    System.out.println("CLOSED " + loader.closed);
  }
}

class ConfigException extends Exception {
  ConfigException(String message) {
    super(message);
  }
}

class ConfigLoader {
  final Parser parser = new Parser();
  boolean closed;

  int load(String text) throws ConfigException {
    return parser.parse(text);
  }

  int loadLenient(String text) {
    try {
      return parser.parse(text);
    } catch (ConfigException ignored) {
      return -1;
    }
  }

  void close() {
    closed = true;
  }
}

class Parser {
  final Validator validator = new Validator();

  int parse(String text) throws ConfigException {
    int count = 0;
    for (String pair : text.split(";")) {
      String[] parts = pair.split("=");
      validator.check(parts[0], Integer.parseInt(parts[1]));
      count = count + 1;
    }
    return count;
  }
}

class Validator {
  final Rule positive = new Rule();

  void check(String key, int value) throws ConfigException {
    positive.apply(key, value);
  }
}

class Rule {
  int evaluations;

  void apply(String key, int value) throws ConfigException {
    evaluations = evaluations + 1;
    if (value <= 0) throw new ConfigException("non-positive " + key);
  }
}

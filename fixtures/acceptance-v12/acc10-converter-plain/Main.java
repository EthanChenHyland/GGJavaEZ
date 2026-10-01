import java.util.Scanner;

public class Main {
  public static void main(String[] args) {
    Scanner input = new Scanner(System.in);
    Converter converter = new Converter();
    while (input.hasNext()) {
      String command = input.next();
      if (command.equals("quit")) break;
      double amount = input.nextDouble();
      double result = converter.convert(command, amount);
      if (result < 0) System.err.println("UNKNOWN " + command);
      else System.out.println("RESULT " + result);
    }
    System.out.println("CONVERSIONS " + converter.conversions);
  }
}

class Converter {
  int conversions;

  double convert(String unit, double amount) {
    double factor = factorFor(unit);
    if (factor < 0) return -1;
    conversions = conversions + 1;
    return amount * factor;
  }

  double factorFor(String unit) {
    if (unit.equals("km")) return 0.621;
    if (unit.equals("mi")) return 1.609;
    if (unit.equals("kg")) return 2.205;
    return -1;
  }
}

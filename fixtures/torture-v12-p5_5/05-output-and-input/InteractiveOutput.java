import java.util.Scanner;
public class InteractiveOutput {
  public static void main(String[] args) {
    Scanner input=new Scanner(System.in);
    System.out.println("READY");
    String blank=input.nextLine(); String unicode=input.nextLine(); String longLine=input.nextLine();
    System.out.println("INPUT " + blank.length() + " " + unicode + " " + longLine.length());
    for(int i=0;i<2000;i++) { System.out.println("OUT " + i); System.err.println("ERR " + i); }
    System.out.println("FINISHED");
  }
}

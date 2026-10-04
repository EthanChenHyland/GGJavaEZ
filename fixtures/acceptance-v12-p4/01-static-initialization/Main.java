public class Main {
 static class Meter { static int total=seed(); static Object token=new Object(); static {total+=2;} static int seed(){System.out.println("init");return 4;} }
 static class Child extends Meter {} static class Hidden extends Meter {static int total=80;}
 public static void main(String[] args){int before=Child.total;Child.total+=5;int after=Meter.total;Object alias=Meter.token;Hidden.total++;System.out.println(before+":"+after+":"+Hidden.total+":"+(alias==Meter.token));}
}

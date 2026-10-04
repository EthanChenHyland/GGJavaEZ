public class Main {
 record Coordinate(int east,long north){}
 public static void main(String[] args){Coordinate point=new Coordinate(7,9007199254740993L);Coordinate same=new Coordinate(7,9007199254740993L);int east=point.east();long north=point.north();boolean equal=point.equals(same);System.out.println(east+":"+north+":"+equal+":"+(point.hashCode()==same.hashCode()));}
}

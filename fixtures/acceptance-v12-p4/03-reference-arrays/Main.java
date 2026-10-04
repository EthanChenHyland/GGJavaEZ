public class Main {
 static class Parcel {int code;Parcel(int code){this.code=code;}}
 public static void main(String[] args){Parcel parcel=new Parcel(41);Parcel[] first=new Parcel[3];first[0]=parcel;first[1]=null;Parcel[] alias=first;Object[] objects=alias;objects[2]=parcel;Parcel selected=first[2];String[] labels=new String[]{"cargo",null};String label=labels[0];System.out.println((first==alias)+":"+(selected==parcel)+":"+(first[1]==null)+":"+label);}
}

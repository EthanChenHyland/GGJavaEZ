public class Main {
 int offset=17;
 class Channel {int read(){return offset+1;}}
 public static void main(String[] args){Main owner=new Main();Channel inner=owner.new Channel();int result=inner.read();System.out.println(result);}
}

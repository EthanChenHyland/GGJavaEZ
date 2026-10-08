import java.util.*;
public class Topology {
  static class Node { Node next; Node previous; Node shared; int value; Node(int value) { this.value=value; } }
  public static void main(String[] args) {
    Node a=new Node(1), b=new Node(2), c=new Node(3); a.next=b; b.next=c; c.next=a; a.previous=c; b.previous=a; c.previous=b; a.shared=a; b.shared=a; c.shared=a;
    int[] empty=new int[0], single={7}, five={1,2,3,4,5}, hundred=new int[100], sparse=new int[10001]; sparse[10000]=73; int observed=sparse[10000];
    Node[] inbound=new Node[100]; for(int i=0;i<inbound.length;i++) inbound[i]=a;
    Node[][] ragged={null,new Node[0],new Node[]{a,b},inbound,inbound};
    ArrayList<Object> list=new ArrayList<>(); list.add(null); list.add(a); list.add("first\nsecond 🟣");
    HashMap<Object,Object> map=new HashMap<>(); map.put("veryLongMapKey".repeat(12),b); map.put(a,c); map.put(null,null);
    HashSet<Object> set=new HashSet<>(); set.add(a); set.add(b); set.add(null);
    ArrayDeque<Object> queue=new ArrayDeque<>(); queue.add(a); queue.add(b);
    ArrayList<Integer> large=new ArrayList<>(); for(int i=0;i<1000;i++) large.add(i%10);
    System.out.println("TOPOLOGY " + observed + " " + inbound.length + " " + large.size() + " " + map.size() + " " + (ragged[3]==ragged[4]));
  }
}
